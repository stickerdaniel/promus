# Daytona Sandbox + Mistral Vibe Integration (Updated Plan)

## Context

Promus needs a sandbox feature where **mistral-vibe** runs inside a Daytona cloud sandbox, accessible from the web UI. Vibe has `vibe --prompt "..." --output streaming --auto-approve` (NDJSON to stdout). We wrap it with a thin Python HTTP server inside the sandbox.

**Key change from v1**: Sandbox state is a **local Convex component** (like betterAuth) for clean isolation. The vibe agent gets Unipile access but is walled off from main app tables.

**Key discovery from SDK**: Daytona TS SDK has NO `snapshot.create()` API. It uses `image` param (Docker image string) on `daytona.create()`. We use a pre-built Docker image pushed to a registry, or build inline via Daytona's `image` param.

---

## Architecture

```
Browser <--SSE--> SvelteKit API route <--HTTP/SSE--> Sandbox vibe-server.py <--subprocess--> vibe CLI
                        |
                    Convex DB (sandbox component: sessions, messages)
```

**Daytona SDK API surface** (from `docs/references/daytona-sdk/`):

- `daytona.create({ image, envVars, public, autoStopInterval, resources })` → `Sandbox`
- `sandbox.process.executeCommand(cmd, cwd, env)` → `{ exitCode, result }`
- `sandbox.process.createSession(id)` / `executeSessionCommand(id, { command, runAsync })` → persistent bg process
- `sandbox.process.getSessionCommandLogs(sessionId, cmdId, onLogs)` → streaming logs
- `sandbox.fs.uploadFile(Buffer, remotePath)` — upload files as buffers
- `sandbox.getPreviewLink(port)` → `{ url, token }`
- `sandbox.start()` / `sandbox.stop()` / `sandbox.delete()`
- `sandbox.info()` → `{ state, ... }` (states: `started`, `stopped`, `error`, etc.)

---

## Step 1: Install dependency

```bash
bun add @daytonaio/sdk
```

Env vars (`.env.local`): `DAYTONA_API_KEY`, `MISTRAL_API_KEY`, optionally `DAYTONA_API_URL`

---

## Step 2: Convex component — `src/lib/convex/sandbox/`

Local component following betterAuth pattern.

### `src/lib/convex/sandbox/convex.config.ts`

```typescript
import { defineComponent } from 'convex/server';
const component = defineComponent('sandbox');
export default component;
```

### `src/lib/convex/sandbox/schema.ts`

```typescript
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	sessions: defineTable({
		userId: v.string(),
		sandboxId: v.string(),
		status: v.union(
			v.literal('creating'),
			v.literal('ready'),
			v.literal('stopped'),
			v.literal('error'),
			v.literal('deleted')
		),
		previewUrl: v.optional(v.string()),
		previewToken: v.optional(v.string()),
		lastActiveAt: v.number(),
		createdAt: v.number(),
		errorMessage: v.optional(v.string())
	})
		.index('by_user', ['userId'])
		.index('by_user_status', ['userId', 'status'])
		.index('by_sandbox', ['sandboxId']),

	messages: defineTable({
		sessionId: v.id('sessions'), // v.id() internally, v.string() at boundary args
		userId: v.string(),
		role: v.union(
			v.literal('user'),
			v.literal('assistant'),
			v.literal('tool'),
			v.literal('system')
		),
		content: v.string(),
		metadata: v.optional(v.any()),
		createdAt: v.number()
	}).index('by_session', ['sessionId', 'createdAt'])
});
```

### `src/lib/convex/sandbox/sessions.ts` — component functions

- `getUserSession` query — active session for userId
- `createSession` mutation — insert session record, return id
- `updateSessionStatus` mutation — update status/previewUrl/error
- `updateLastActive` mutation — touch timestamp
- `deleteSession` mutation — mark deleted

### `src/lib/convex/sandbox/messages.ts` — component functions

- `listMessages` query — by sessionId, ordered by createdAt. Note: `.paginate()` doesn't work in components; use `convex-helpers` paginator if pagination needed
- `saveMessage` mutation — insert message. Accept sessionId as `v.string()` in args, cast internally

### Register in `src/lib/convex/convex.config.ts`

```typescript
import sandbox from './sandbox/convex.config';
// ...
app.use(sandbox);
```

### App-level wrappers — `src/lib/convex/sandboxApi.ts`

Thin wrappers that call component functions via `ctx.runQuery(components.sandbox.sessions.getUserSession, { userId })`.

Then `bun run generate`.

---

## Step 3: Server sandbox module — `src/lib/server/sandbox/`

### `types.ts` — TypeScript types

- `SandboxSessionState`, `ChatStreamRequest`, `ChatStreamEvent`, `VibeMessage`

### `daytona.ts` — singleton client

```typescript
import { Daytona } from '@daytonaio/sdk';
let instance: Daytona | null = null;
export function getDaytona(): Daytona {
	if (!instance) {
		instance = new Daytona({
			apiKey: process.env.DAYTONA_API_KEY,
			apiUrl: process.env.DAYTONA_API_URL
		});
	}
	return instance;
}
```

### `vibe-server-script.ts` — Python HTTP wrapper (string constant)

Minimal Starlette app uploaded to sandbox as buffer:

- `GET /health` → `{"status":"ok"}`
- `POST /chat/stream` → accepts `{ prompt, sessionId?, maxTurns?, cwd? }`, spawns `vibe --prompt "..." --output streaming --auto-approve` as subprocess, streams stdout lines as SSE
- Handles SIGTERM for graceful cleanup

### `config-builder.ts` — generates vibe config files

- `getVibeConfigToml()` → `~/.vibe/config.toml`
- `getVibeEnvContent()` → env file with `MISTRAL_API_KEY`

### `sandbox-manager.ts` — lifecycle management

Uses Daytona SDK directly (no snapshot API):

- `createSandbox(userId)`:
  1. `daytona.create({ image: 'python:3.12-slim', envVars: { MISTRAL_API_KEY }, public: true, autoStopInterval: 5 })`
  2. Install tools via `sandbox.process.executeCommand('apt-get update && apt-get install -y git curl ripgrep && pip install uv && uv pip install --system mistral-vibe starlette uvicorn sse-starlette')`
  3. Upload config + server script via `sandbox.fs.uploadFile(Buffer.from(...), path)`
  4. Create session, start `python /home/daytona/vibe-server.py` via `sandbox.process.executeSessionCommand()`
  5. Health poll via `sandbox.process.executeCommand('curl -s http://localhost:3000/health')`
  6. Get preview: `sandbox.getPreviewLink(3000)` → `{ url, token }`
  7. Return `{ sandboxId: sandbox.id, previewUrl: url, previewToken: token }`

- `ensureSandboxReady(sandboxId)`:
  - `sandbox.info()` → check state
  - If `started` → return previewUrl
  - If `stopped` → `sandbox.start()`, restart server session, health poll
  - If unknown → create new

- `stopSandbox(sandboxId)` — `sandbox.stop()`
- `deleteSandbox(sandboxId)` — `sandbox.delete()`

---

## Step 4: SvelteKit API routes — `src/routes/api/sandbox/`

### `stream/+server.ts` — SSE proxy (main endpoint)

1. Auth via `locals.user`
2. Parse body: `{ prompt, sessionId? }`
3. Get/create sandbox via Convex component + `ensureSandboxReady()`
4. Save user message to component
5. Forward `POST {previewUrl}/chat/stream` with auth token
6. Proxy SSE back to client, accumulate assistant response
7. On stream end, save assistant message to component

### `status/+server.ts` — sandbox status

- `GET` → current sandbox state for authenticated user

### `manage/+server.ts` — sandbox lifecycle

- `POST { action: 'start' | 'stop' | 'delete' }` → manage sandbox

---

## Step 5: UI — `src/routes/[[lang]]/app/sandbox/+page.svelte`

### Page layout

- Top bar: status indicator (creating/ready/stopped), stop/start button
- Center: scrollable message list
- Bottom: input box with send

### Components in `src/lib/components/sandbox/`

- `sandbox-status.svelte` — status badge
- `sandbox-chat.svelte` — main chat container with SSE streaming
- `vibe-message.svelte` — renders vibe messages (text, tool calls, results)

### Streaming logic

```svelte
<script lang="ts">
	let messages: VibeMessage[] = $state([]);
	let isStreaming = $state(false);

	async function send(prompt: string) {
		isStreaming = true;
		messages.push({ role: 'user', content: prompt });
		const res = await fetch('/api/sandbox/stream', {
			method: 'POST',
			body: JSON.stringify({ prompt })
		});
		const reader = res.body!.getReader();
		// Parse SSE, update messages reactively
		isStreaming = false;
	}
</script>
```

---

## Step 6: Sidebar + i18n

- Add nav item in `app-sidebar-config.ts`
- Translation keys in all 4 locales: `sandbox.*`, `meta.app.sandbox.*`
- `SEOHead` on page

---

## Step 7: Security

- User isolation: one sandbox per user, sandboxId in component tied to userId
- API keys: server-side `MISTRAL_API_KEY` from env, injected into sandbox. Never exposed to client.
- Unipile access: `UNIPILE_API_KEY` + `UNIPILE_DSN` injected into sandbox env for vibe to use
- Rate limiting: `@convex-dev/rate-limiter` for sandbox creation (max 3/hour)
- Auto-stop: 5 min via Daytona `autoStopInterval`
- Auth: all API routes check `locals.user`

---

## Step 8: Update CLAUDE.md

Add to CLAUDE.md agents section:

- `docs/references/daytona-sdk/` — Daytona TS/Python SDK source. Consult `packages/typescript/src/` for API types before implementing sandbox features.
- btca resource `daytonaSDK` if applicable

---

## Implementation order

1. `bun add @daytonaio/sdk`
2. Convex component: `src/lib/convex/sandbox/` (config, schema, sessions.ts, messages.ts)
3. Register component + `bun run generate`
4. App-level wrappers: `src/lib/convex/sandboxApi.ts`
5. Server module: `src/lib/server/sandbox/` (types, daytona, vibe-server-script, config-builder, sandbox-manager)
6. API routes: `src/routes/api/sandbox/`
7. UI components: `src/lib/components/sandbox/`
8. Page: `src/routes/[[lang]]/app/sandbox/+page.svelte`
9. Sidebar nav + i18n keys + `bun run i18n:push`
10. Update CLAUDE.md with daytona reference docs

---

## Verification

1. `bun run generate` — no errors
2. `bun run check` — no type errors
3. Navigate to `/app/sandbox`, start sandbox, send message, verify streaming
4. Auto-stop after 5 min, resume on next message
5. `bun scripts/static-checks.ts` on all changed files
