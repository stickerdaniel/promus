# Promus

A Kanban board where each task gets an AI agent that can use your connected accounts (Gmail, LinkedIn, WhatsApp, etc.) to do the actual work.

**[Try it](https://promus-ai.vercel.app)**

## How it works

Four columns: **Todo → Working On → Prepared → Done**.

You write a task in plain language. An agent picks it up, writes TypeScript against the Unipile SDK, runs it in an isolated VM, and comes back with results. Nothing executes without your approval.

Agents can read each other's output and notify each other, so finished work feeds into the next task.

## Stack

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| Frontend     | SvelteKit, Svelte 5, Tailwind v4, shadcn-svelte               |
| Backend      | Convex (real-time DB + agent orchestration)                   |
| Execution    | Node.js VM on Vercel (esbuild + isolated sandbox)             |
| Integrations | Unipile (email, LinkedIn, messaging), Resend, Tolgee, PostHog |
| Auth         | Better Auth (passkeys, OAuth, email/password)                 |

## Built by

[Daniel Sticker](https://github.com/stickerdaniel) and [Fadi Al Eliwi](https://github.com/Letizeus) at the [Mistral Worldwide Hackathon](https://mistral.ai/) 2026.

## License

MIT
