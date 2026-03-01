"""
Promus Task Agent Evaluation Runner

Tests the Orchestrator's planning and the Executor's code generation
against a dataset of real-world tasks. Scores logged to W&B Weave.

Usage:
    uv run python scripts/run_eval.py

Env vars required:
    MISTRAL_API_KEY - Mistral API key (uses Mistral API for eval, prod uses Bedrock)
    WANDB_API_KEY   - W&B API key
"""

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, cast

import weave
from mistralai import Mistral


def strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences from LLM output."""
    text = text.strip()
    text = re.sub(r"^```(?:json|typescript|ts|javascript|js)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()

sys.path.insert(0, str(Path(__file__).parent.parent))
from scorers.code import code_quality, sdk_call_accuracy
from scorers.plan import plan_quality, step_overlap

# --- Prompts (versioned here for self-improvement tracking) ---

ORCHESTRATOR_PROMPT = """You are the Promus task orchestrator. Given a task from the user's
todo list, decompose it into concrete, actionable execution steps.

Each step will be sent to an Executor agent that can write and run Unipile SDK code.
Available SDK capabilities:
- emails.list(query, filters) - search/list emails
- emails.send(to, subject, body) - send emails
- linkedin.search(name, company, title) - search LinkedIn profiles
- linkedin.connect(profileId, message) - send connection requests
- messaging.send(channel, recipient, message) - send WhatsApp/messaging

Rules:
- Each step must map to ONE specific SDK operation or data processing action
- Steps must be in dependency order (e.g., search before connect)
- Use action verbs: "Search emails for...", "Extract names from...", "Send connection request to..."
- Include 3-6 steps per task
- Do NOT wrap your response in markdown code fences

Return ONLY valid JSON (no markdown, no backticks):
{"steps": ["step1", "step2", ...], "reasoning": "why this decomposition"}"""

EXECUTOR_PROMPT = """You are the Promus task executor running in a sandbox with the Unipile SDK.
Given a subtask, write TypeScript code to accomplish it using the Unipile Node SDK.

SDK setup (already available, do not re-import):
  import { UnipileClient } from 'unipile-node-sdk';
  const client = new UnipileClient({ dsn, apiKey });

Available methods:
- client.emails.list({ query?: string, limit?: number }) → Email[]
- client.emails.send({ to: string, subject: string, body: string }) → void
- client.linkedin.search({ name?: string, company?: string, title?: string }) → Profile[]
- client.linkedin.connect({ profileId: string, message?: string }) → void
- client.messaging.send({ channel: string, recipient: string, message: string }) → void

Rules:
- Write a single async function that handles the subtask
- Include try/catch error handling
- Use typed parameters where possible
- Do NOT wrap code in markdown fences (no ```)
- Return ONLY raw TypeScript code, no explanation"""


@weave.op()
async def process_task(
    task_title: str,
    context: str,
    expected_steps: list[str] | None = None,
    expected_sdk_calls: list[str] | None = None,
) -> dict:
    """Process a task through the Orchestrator -> Executor pipeline."""
    client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])
    start = time.time()

    # Step 1: Orchestrator decomposes the task
    plan_messages = cast(
        Any,
        [
            {"role": "system", "content": ORCHESTRATOR_PROMPT},
            {"role": "user", "content": f"Task: {task_title}\nContext: {context}"},
        ],
    )
    plan_response = await client.chat.complete_async(
        model="devstral-small-latest",
        messages=plan_messages,
        temperature=0.2,
    )

    raw_plan = plan_response.choices[0].message.content or ""
    try:
        plan_data = json.loads(strip_markdown_fences(raw_plan))
    except json.JSONDecodeError:
        plan_data = {"steps": [], "reasoning": "parse_error", "raw": raw_plan[:200]}

    # Step 2: Executor generates code for the first subtask
    first_step = plan_data["steps"][0] if plan_data.get("steps") else "no steps"

    code_messages = cast(
        Any,
        [
            {"role": "system", "content": EXECUTOR_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Subtask: {first_step}\n"
                    f"Original task: {task_title}\n"
                    f"Context: {context}"
                ),
            },
        ],
    )
    code_response = await client.chat.complete_async(
        model="devstral-small-latest",
        messages=code_messages,
        temperature=0.2,
    )

    code = strip_markdown_fences(code_response.choices[0].message.content or "")

    latency_ms = (time.time() - start) * 1000

    return {
        "steps": plan_data.get("steps", []),
        "reasoning": plan_data.get("reasoning", ""),
        "code": code,
        "first_step": first_step,
        "latency_ms": latency_ms,
    }


@weave.op()
def latency_check(model_output: dict) -> dict:
    """Check if planning + code gen completed within 15s threshold."""
    latency_ms = model_output.get("latency_ms", float("inf"))
    return {"under_threshold": latency_ms < 15000, "latency_ms": latency_ms}


async def main():
    weave.init("stickerdaniel-/promus-task-agent")

    dataset_path = Path(__file__).parent.parent / "datasets" / "tasks.json"
    with open(dataset_path) as f:
        rows = json.load(f)

    dataset = weave.Dataset(name="promus-tasks-v2", rows=rows)

    evaluation = weave.Evaluation(
        dataset=dataset,
        scorers=[step_overlap, plan_quality, sdk_call_accuracy, code_quality, latency_check],
    )

    results = await evaluation.evaluate(process_task)
    print("\n=== Evaluation Results ===")
    print(json.dumps(results, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
