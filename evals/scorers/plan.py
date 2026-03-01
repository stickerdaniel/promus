import json
import os
import re
from typing import Any, cast

import weave
from mistralai import Mistral


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()

PLAN_JUDGE_PROMPT = """You are evaluating an AI task agent's plan decomposition quality.

Given a task, context, expected steps, and the agent's proposed steps, score each dimension 1-5:
- step_coverage: Do the agent's steps cover all necessary actions from the expected steps? 1=none covered, 5=all covered
- step_order: Are steps in a logical dependency order? (e.g., search before connect) 1=random order, 5=perfect order
- specificity: Are steps concrete and actionable? (mention specific SDK methods, data to extract, etc.) 1=vague, 5=very specific

If the agent produced an empty plan or no steps, score all dimensions as 1.

Do NOT wrap your response in markdown. Return ONLY valid JSON:
{"step_coverage": N, "step_order": N, "specificity": N, "reasoning": "brief explanation"}"""


@weave.op()
def step_overlap(model_output: dict, expected_steps: list[str]) -> dict:
    """Check how many expected steps appear in the generated plan."""
    plan_steps = model_output.get("steps", [])
    plan_text = " ".join(s.lower() for s in plan_steps)

    matched = 0
    for expected in expected_steps:
        # Match if at least 2 keywords (or all for short phrases) appear in plan
        keywords = [kw for kw in expected.lower().split() if len(kw) > 2]
        threshold = min(2, len(keywords))
        hits = sum(1 for kw in keywords if kw in plan_text)
        if hits >= threshold:
            matched += 1

    coverage = matched / len(expected_steps) if expected_steps else 0
    return {"coverage": coverage, "matched": matched, "total": len(expected_steps)}


@weave.op()
async def plan_quality(
    model_output: dict,
    task_title: str,
    context: str,
    expected_steps: list[str],
) -> dict:
    """LLM-as-judge: Mistral evaluates plan decomposition quality."""
    client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])
    steps = model_output.get("steps", [])

    messages = cast(
        Any,
        [
            {"role": "system", "content": PLAN_JUDGE_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Task: {task_title}\n"
                    f"Context: {context}\n"
                    f"Expected steps: {json.dumps(expected_steps)}\n"
                    f"Agent steps: {json.dumps(steps)}"
                ),
            },
        ],
    )
    response = await client.chat.complete_async(
        model="mistral-large-latest",
        messages=messages,
        temperature=0.1,
    )

    try:
        raw = response.choices[0].message.content or ""
        scores = json.loads(_strip_fences(raw))
        return {
            "step_coverage": scores["step_coverage"] / 5,
            "step_order": scores["step_order"] / 5,
            "specificity": scores["specificity"] / 5,
            "average": (
                scores["step_coverage"] + scores["step_order"] + scores["specificity"]
            ) / 15,
        }
    except (json.JSONDecodeError, KeyError):
        return {"step_coverage": 0, "step_order": 0, "specificity": 0, "average": 0}
