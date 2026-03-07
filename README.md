# Promus

A task board where every todo gets its own AI agent.

Your agent searches your emails, finds LinkedIn profiles, drafts messages, and hands everything back for your approval. Nothing runs without your sign-off.

**[Try it](https://promus-ai.vercel.app)**

## How it works

Four columns: **Todo → Working On → Prepared → Done**.

Drop a task in your own words. An **Orchestrator** (Claude on AWS Bedrock) reads it, breaks it into steps, and delegates work to an **Executor** (Mistral Devstral in a Daytona sandbox) that writes and runs Unipile SDK code on the fly.

Agents share context. A finished task teaches the next one. An agent can activate others that stopped. It starts to feel like a hivemind working through your list.

## Stack

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| Frontend     | SvelteKit, Svelte 5, Tailwind v4, shadcn-svelte               |
| Backend      | Convex                                                        |
| Orchestrator | Claude Opus 4.6 (AWS Bedrock)                                 |
| Executor     | Daytona sandbox + Mistral Devstral                            |
| Integrations | Unipile (email, LinkedIn, messaging), Resend, Tolgee, PostHog |
| Auth         | Better Auth (passkeys, OAuth, email/password)                 |

## Built by

[Daniel Sticker](https://github.com/stickerdaniel) and [Fadi Al Eliwi](https://github.com/Letizeus) at the [Mistral Worldwide Hackathon](https://mistral.ai/) 2026.

## License

MIT
