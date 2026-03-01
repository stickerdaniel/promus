# Promus

The task takes 2 minutes. The prep takes 3 days.

Follow up with speakers — _3 days ago_. Send LinkedIn intros — _5 days ago_. Draft partnership email — _1 week ago_. We all have that list. The tasks aren't hard, they just need digging through emails, finding the right people, writing the right words. So they sit there.

Promus does the prep. You write a task, it searches your emails, finds LinkedIn profiles, drafts the messages, and hands everything back for your approval. Nothing gets sent without your sign-off.

Built by **Fadi Al Eliwi** and **Daniel Sticker** at the [Mistral Worldwide Hackathon](https://mistral.ai/).

## Two agents, one board

The Kanban board is the whole interface. Four columns: **Todo → Working On → Prepared → Done**. You drop a task into Todo. From there:

An **Orchestrator** (Claude Opus on AWS Bedrock) reads your task, breaks it into steps, and delegates work. It lives server-side in Convex and never touches external APIs directly — it just plans and coordinates.

An **Executor** (Daytona sandbox + Mistral Vibe CLI, powered by Devstral) does the actual work. It gets a focused prompt like _"list emails containing speaker contact info"_, writes the Unipile SDK code from scratch, runs it in an isolated cloud sandbox, and sends results back. No hardcoded wrappers — the LLM generates whatever API call the task needs.

Why split it? The Executor gets a tiny context (just the subtask + SDK docs), so it's fast and cheap. If a subtask fails, only that step retries. And we can hit any Unipile endpoint without writing a wrapper for each one.

### Example: "Connect with hackathon attendees on LinkedIn"

1. Orchestrator plans: search emails → extract names → LinkedIn search → send requests
2. Executor writes `emails.list` code, runs it → 100 emails about the hackathon
3. Orchestrator pulls attendee names from the email bodies
4. Executor writes `linkedin.search` code → 62 matching profiles
5. Executor writes `linkedin.connect` code → queues connection requests
6. Task moves to **Prepared** — you review 47 drafts before they go out
7. You approve → **Done**

### It learns from you

Give feedback on a draft — too formal, wrong tone, missing context — and the agent adapts. Your corrections feed back into the next run. Your standards become its standards.

## Beyond the board

We built a full platform around the task agent:

- **Real-time everything** — Convex reactive queries, no polling. Open two tabs and watch them sync.
- **Auth** — email/password, Google OAuth, passkeys. Better Auth with admin roles.
- **Community chat** — real-time messaging with usage-based billing (Autumn + Stripe).
- **AI support** — customer support agent that handles questions and hands off to humans when needed.
- **Admin panel** — user management, audit logs, metrics dashboard, support tickets.
- **Vibe Sandbox** — separate interactive AI coding environment running on Daytona.
- **Emails** — transactional delivery via Resend with bounce/open/click tracking.
- **4 languages** — EN, DE, ES, FR via Tolgee with in-context editing.
- **Analytics** — PostHog with optional Cloudflare proxy.

## Tech stack

|                |                                                         |
| -------------- | ------------------------------------------------------- |
| Frontend       | SvelteKit, Svelte 5 (runes), Tailwind v4, shadcn-svelte |
| Backend        | Convex (real-time DB + serverless)                      |
| Orchestrator   | Convex Agent SDK + Claude Opus 4.6 (AWS Bedrock)        |
| Executor       | Daytona sandbox + Mistral Vibe CLI (Devstral)           |
| Communication  | Unipile (unified email, LinkedIn, messaging API)        |
| Auth           | Better Auth (sessions, OAuth, passkeys)                 |
| Email delivery | Resend                                                  |
| Billing        | Autumn + Stripe                                         |
| i18n           | Tolgee                                                  |
| Testing        | Playwright + Vitest                                     |
| Hosting        | Vercel + Convex Cloud                                   |

## Architecture

```
┌──────────────────────────────────────────────┐
│              SvelteKit Frontend               │
│   Kanban · Chat · Sandbox · Admin · Settings  │
└──────────────────┬───────────────────────────┘
                   │ real-time subscriptions
┌──────────────────▼───────────────────────────┐
│               Convex Backend                  │
│                                               │
│  ┌─────────────┐      ┌───────────────────┐  │
│  │ Orchestrator │      │ Support Agent     │  │
│  │ (Claude Opus)│      │ (auto + handoff)  │  │
│  └──────┬──────┘      └───────────────────┘  │
│         │ delegates                           │
│  ┌──────▼──────┐                              │
│  │  Executor   │───► Daytona Sandbox          │
│  │ (Vibe CLI)  │     └► Unipile SDK calls     │
│  └─────────────┘                              │
└───────────────────────────────────────────────┘
        │                       │
   ┌────▼────┐           ┌─────▼──────┐
   │ Resend  │           │ Unipile    │
   │ (email  │           │ (email,    │
   │ delivery│           │  LinkedIn, │
   └─────────┘           │  messaging)│
                         └────────────┘
```

## Project structure

```
src/lib/convex/
├── todo/               # task agent — orchestrator + tools
├── support/            # support agent + LLM config
├── emails/             # Resend email system
├── admin/              # admin panel backend
├── sandboxExecute.ts   # Daytona sandbox runner
├── todos.ts            # task mutations
└── schema.ts           # database schema

src/routes/[[lang]]/
├── app/my-tasks/       # the kanban board
├── app/community-chat/ # real-time messaging
├── app/sandbox/        # vibe sandbox
├── app/settings/       # user settings
├── admin/              # admin panel
└── (auth)/             # sign in/up
```

## Running locally

You need [Bun](https://bun.sh/), a [Convex](https://convex.dev/) account, and a [Resend](https://resend.com/) key.

```bash
git clone https://github.com/stickerdaniel/promus.git
cd promus && bun install
```

Create `.env.local`:

```
CONVEX_DEPLOYMENT=your-deployment
PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

Set up the backend:

```bash
bunx convex dev

# auth
bun convex env set RESEND_API_KEY re_xxxxxxxxxxxx
bun convex env set AUTH_EMAIL "noreply@yourdomain.com"

# task agent
bun convex env set AWS_REGION us-west-2
bun convex env set AWS_ACCESS_KEY_ID your_key
bun convex env set AWS_SECRET_ACCESS_KEY your_secret
bun convex env set DAYTONA_API_KEY your_daytona_key
bun convex env set UNIPILE_API_KEY your_unipile_key
```

```bash
bun run dev
# → http://localhost:5173
```

First admin — sign up, then:

```bash
bun convex run admin/mutations:seedFirstAdmin '{"email":"you@example.com"}'
```

## Deploy

Vercel — set `PUBLIC_CONVEX_URL` and `CONVEX_DEPLOY_KEY`, override build command to `bunx convex deploy --cmd 'bun run build'`, then `vercel --prod`.

## Eval

Plan quality scored via Weights & Biases Weave — LLM-as-judge on task decomposition and generated SDK code. No sandbox in evals, too slow and flaky.

## Sponsors

NVIDIA · AWS · ElevenLabs · Mistral · Hugging Face · Weights & Biases · Supercell

## License

MIT
