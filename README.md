# Promus

A task board where every todo gets its own AI agent.

Your agent searches your emails, finds LinkedIn profiles, drafts messages, and hands everything back for your approval. Nothing runs without your sign-off.

**[Try it](https://promus-ai.vercel.app)**

## How it works

Four columns: **Todo → Working On → Prepared → Done**.

Drop a task in your own words. It gets its own agent. The agent writes TypeScript on the fly, executes it in an isolated VM, and uses your connected tools (Gmail, LinkedIn, WhatsApp, and more) to get the job done. You review the result and approve.

Agents share context. A finished task teaches the next one. An agent can activate others that stopped. A hivemind working through your list.

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
