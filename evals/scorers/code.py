import json
import os
import re
from typing import Any, cast

import weave
from mistralai import Mistral


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json|typescript|ts)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


CODE_JUDGE_PROMPT = """You are evaluating generated Unipile SDK TypeScript code for a task agent.

Given the original task, the subtask being executed, the expected SDK calls, and the generated code, score each 1-5:
- sdk_correctness: Does the code use the correct Unipile SDK methods (emails.list, emails.send, linkedin.search, linkedin.connect, messaging.send)? 1=wrong methods, 5=all correct
- completeness: Does the code handle the full subtask end-to-end? 1=incomplete, 5=complete
- error_handling: Does the code include try/catch and edge case handling? 1=none, 5=comprehensive

Do NOT wrap your response in markdown. Return ONLY valid JSON:
{"sdk_correctness": N, "completeness": N, "error_handling": N, "reasoning": "brief explanation"}"""


@weave.op()
def sdk_call_accuracy(model_output: dict, expected_sdk_calls: list[str]) -> dict:
    """Check if generated code references the expected SDK methods."""
    code = model_output.get("code", "")
    code_lower = code.lower()

    matched = 0
    for call in expected_sdk_calls:
        if call.lower().replace(".", " ").split()[-1] in code_lower:
            matched += 1

    coverage = matched / len(expected_sdk_calls) if expected_sdk_calls else 0
    return {"coverage": coverage, "matched": matched, "total": len(expected_sdk_calls)}


@weave.op()
async def code_quality(
    model_output: dict,
    task_title: str,
    expected_sdk_calls: list[str],
) -> dict:
    """LLM-as-judge: Mistral evaluates generated Unipile SDK code."""
    client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])
    code = model_output.get("code", "")

    if not code:
        return {"sdk_correctness": 0, "completeness": 0, "error_handling": 0, "average": 0}

    first_step = model_output.get("first_step", "unknown")
    messages = cast(
        Any,
        [
            {"role": "system", "content": CODE_JUDGE_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Original task: {task_title}\n"
                    f"Subtask being executed: {first_step}\n"
                    f"Expected SDK calls: {json.dumps(expected_sdk_calls)}\n"
                    f"Generated code:\n{code}"
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
            "sdk_correctness": scores["sdk_correctness"] / 5,
            "completeness": scores["completeness"] / 5,
            "error_handling": scores["error_handling"] / 5,
            "average": (
                scores["sdk_correctness"] + scores["completeness"] + scores["error_handling"]
            ) / 15,
        }
    except (json.JSONDecodeError, KeyError):
        return {"sdk_correctness": 0, "completeness": 0, "error_handling": 0, "average": 0}
