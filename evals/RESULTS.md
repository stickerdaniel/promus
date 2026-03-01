# Promus Task Agent — Self-Improvement Eval Results

## W&B Weave Dashboard

https://wandb.ai/stickerdaniel-/promus-task-agent/weave

## Reports

- [v1 → v2: Self-Improvement Eval Report](https://wandb.ai/stickerdaniel-/promus-task-agent/reports/Promus-Task-Agent:-Self-Improvement-Eval-Report--VmlldzoxNjA2Njk3Mg==)
- [v2 → v3: Prompt Improvement Report](https://wandb.ai/stickerdaniel-/promus-task-agent/reports/Eval-v2-→-v3:-Prompt-Improvement-Report--VmlldzoxNjA2NzAyMw==)

## Eval Progression

### v1 — Broken Baseline

| Scorer            | Score  |
| ----------------- | ------ |
| step_overlap      | 0%     |
| plan_quality avg  | 0%     |
| code_quality avg  | 0%     |
| sdk_call_accuracy | 87.5%  |
| latency (mean)    | 2709ms |

**Root cause:** Devstral wrapped all JSON in markdown fences (` ```json `) → `json.loads()` failed silently → empty steps → all downstream scorers returned 0%.

### v2 — Fixed Parsing + Improved Prompts

| Scorer            | Score  | Delta     |
| ----------------- | ------ | --------- |
| step_overlap      | 89.2%  | +89.2pp   |
| plan_quality avg  | 87.2%  | +87.2pp   |
| code_quality avg  | 77.8%  | +77.8pp   |
| sdk_call_accuracy | 54.2%  | -33.3pp\* |
| latency (mean)    | 2369ms | -13%      |

\*sdk_call_accuracy decreased because executor now correctly generates code for only the first subtask, not the whole task.

**Changes applied:**

- `strip_markdown_fences()` utility added to run_eval.py and both scorers
- Orchestrator prompt: explicit SDK method list, action verb rules, "no markdown fences"
- Executor prompt: full typed method signatures, async function structure
- step_overlap scorer: smarter keyword matching (2+ significant keywords)
- LLM judge prompts: scoring anchors with descriptions

### v3 — SDK Method Annotation + Full-Task Execution

| Scorer               | Score   | Delta vs v2             |
| -------------------- | ------- | ----------------------- |
| step_overlap         | 79.2%   | -10.0pp (format change) |
| plan_quality avg     | 84.4%   | -2.8pp (stricter judge) |
| code_quality avg     | 89.4%   | +11.6pp                 |
| sdk_call_accuracy    | 87.5%   | +37.5pp                 |
| code completeness    | 96.7%   | +23.4pp                 |
| code sdk_correctness | 91.7%   | +6.7pp                  |
| code error_handling  | 80.0%   | +5.0pp                  |
| latency (mean)       | ~2400ms | same                    |

**Changes applied:**

- Orchestrator requires `[emails.list]` SDK method prefix on each step
- Executor generates full-task code (all steps), not just first step
- sdk_call_accuracy scorer matches full method paths
- code_quality judge evaluates complete pipeline

## Self-Improvement Loop

```
1. Run eval → Weave traces all Mistral calls
2. Claude Code queries W&B MCP → finds lowest-scoring tasks
3. Diagnose: trace analysis reveals root cause (fences, missing methods, etc.)
4. Fix: edit prompts in run_eval.py
5. Re-run eval → compare scores
6. Generate W&B report via MCP
```

## Tooling

- **Eval runner:** `evals/scripts/run_eval.py` (uv + Python 3.12)
- **Scorers:** `evals/scorers/plan.py`, `evals/scorers/code.py`
- **Dataset:** `evals/datasets/tasks.json` (12 tasks)
- **Skill:** `.claude/skills/wandb-improve/SKILL.md`
- **W&B MCP:** `claude mcp add --transport http wandb https://mcp.withwandb.com/mcp`
- **Linting:** ruff + ty (zero errors)
