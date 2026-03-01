---
name: wandb-improve
description: Analyze Weave traces and eval results, then improve Mistral prompts for the Promus task agent
---

## Self-Improvement Workflow for Promus

You have access to the W&B MCP Server. Follow this loop:

### Step 1: Run current evals

Run `cd evals && uv run python scripts/run_eval.py` to get baseline scores.

### Step 2: Analyze results via W&B MCP

Use the W&B MCP tools to:

1. Query the latest evaluation results: "Show evaluation scores for promus/task-agent"
2. Query recent traces: "Show the last 20 task processing traces, sorted by latency"
3. Identify patterns: Which intents fail? Which tools are misrouted? What's slow?

### Step 3: Diagnose issues

Read the current prompts in `evals/scripts/run_eval.py`:

- `INTENT_CLASSIFIER_PROMPT` — intent classification system prompt
- `TASK_PLANNER_PROMPT` — task planning system prompt

Compare prompt instructions against the failures found in traces.

### Step 4: Improve

Edit the prompts to address identified issues. Common improvements:

- Add few-shot examples for misclassified intents
- Clarify tool selection rules
- Add tone guidance for drafting
- Adjust temperature for consistency

### Step 5: Re-evaluate

Run `cd evals && uv run python scripts/run_eval.py` again to generate new scores.

### Step 6: Report

Use W&B MCP `create_wandb_report_tool` to create a comparison report showing before/after metrics.
Document what changed and why in a commit message.
