'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { transform } from 'esbuild';
import vm from 'node:vm';
import { UnipileClient } from 'unipile-node-sdk';

const TASK_FILE = '/root/task.ts';
const VIBE_TIMEOUT = 60;
const SCRIPT_TIMEOUT_MS = 15_000;

// ── Daytona REST API client (replaces SDK that hangs in serverless) ──────────

const DAYTONA_API_BASE = 'https://app.daytona.io/api';

function daytonaHeaders(apiKey: string) {
	return {
		Authorization: `Bearer ${apiKey}`,
		'Content-Type': 'application/json'
	};
}

async function daytonaGet(apiKey: string, path: string) {
	const res = await fetch(`${DAYTONA_API_BASE}${path}`, {
		headers: daytonaHeaders(apiKey)
	});
	if (!res.ok) throw new Error(`Daytona GET ${path}: ${res.status} ${await res.text()}`);
	return res.json();
}

async function daytonaPost(apiKey: string, path: string, body?: unknown) {
	const res = await fetch(`${DAYTONA_API_BASE}${path}`, {
		method: 'POST',
		headers: daytonaHeaders(apiKey),
		...(body !== undefined ? { body: JSON.stringify(body) } : {})
	});
	if (!res.ok) throw new Error(`Daytona POST ${path}: ${res.status} ${await res.text()}`);
	const text = await res.text();
	return text ? JSON.parse(text) : undefined;
}

async function getSandboxState(apiKey: string, sandboxId: string): Promise<string> {
	const data = await daytonaGet(apiKey, `/sandbox/${sandboxId}`);
	return data.state;
}

async function startSandbox(apiKey: string, sandboxId: string) {
	await daytonaPost(apiKey, `/sandbox/${sandboxId}/start`);
}

async function uploadFile(apiKey: string, sandboxId: string, filePath: string, content: Buffer) {
	const formData = new FormData();
	formData.append('file', new Blob([new Uint8Array(content)]), filePath.split('/').pop() ?? 'file');
	const res = await fetch(
		`${DAYTONA_API_BASE}/sandbox/${sandboxId}/toolbox/files/upload?path=${encodeURIComponent(filePath)}`,
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}` },
			body: formData
		}
	);
	if (!res.ok) throw new Error(`Daytona upload ${filePath}: ${res.status} ${await res.text()}`);
}

async function executeCommand(
	apiKey: string,
	sandboxId: string,
	command: string,
	timeout: number
): Promise<{ exitCode: number; result: string }> {
	const data = await daytonaPost(apiKey, `/sandbox/${sandboxId}/toolbox/process/execute`, {
		command,
		timeout
	});
	return { exitCode: data?.exitCode ?? -1, result: data?.result ?? '' };
}

async function downloadFile(apiKey: string, sandboxId: string, filePath: string): Promise<Buffer> {
	const res = await fetch(
		`${DAYTONA_API_BASE}/sandbox/${sandboxId}/toolbox/files/download?path=${encodeURIComponent(filePath)}`,
		{
			headers: { Authorization: `Bearer ${apiKey}` }
		}
	);
	if (!res.ok) throw new Error(`Daytona download ${filePath}: ${res.status} ${await res.text()}`);
	const arrayBuf = await res.arrayBuffer();
	return Buffer.from(arrayBuf);
}

// ── Vibe prompt builder (inlined from server/sandbox) ───────────────────────

function buildVibePrompt(userPrompt: string): string {
	return `${SYSTEM_CONTEXT}\n\n## User Request\n\n${userPrompt}`;
}

const SYSTEM_CONTEXT = `## Execution Environment

You have access to a pre-configured Unipile SDK client. To interact with it, write a TypeScript file at \`/root/task.ts\` that will be automatically executed after you finish.

### Available Globals

The \`unipile\` object is a pre-configured SDK client with the following resources:

#### \`unipile.account\`
- \`getAll(input?: { limit?: number; cursor?: string })\` — List all connected accounts
- \`getOne(accountId: string)\` — Get a single account by ID

#### \`unipile.messaging\`
- \`getAllChats(input?: { limit?: number; cursor?: string; account_id?: string; unread?: boolean })\` — List chats
- \`getChat(chatId: string)\` — Get a single chat
- \`getAllMessagesFromChat(input: { chat_id: string; limit?: number; cursor?: string })\` — List messages in a chat
- \`sendMessage(input: { chat_id: string; text: string })\` — Send a message to a chat
- \`startNewChat(input: { account_id: string; text: string; attendees_ids: string[] })\` — Start a new chat

#### \`unipile.email\`
- \`getAll(input?: { account_id?: string; role?: string; folder?: string; limit?: number; cursor?: string })\` — List emails
- \`getOne(emailId: string)\` — Get a single email
- \`getAllFolders(input?: { account_id?: string })\` — List email folders
- \`send(input: { account_id: string; body: string; to: { email: string; display_name?: string }[]; subject?: string })\` — Send an email

#### \`unipile.users\`
- \`getProfile(input: { account_id: string; identifier: string })\` — Get a user profile
- \`getOwnProfile(accountId: string)\` — Get own profile
- \`getAllRelations(input: { account_id: string; limit?: number; cursor?: string })\` — List relations

### Other Globals
- \`console.log(...args)\` — Output results (captured and returned to the user)
- \`fetch\`, \`JSON\`, \`Date\`, \`Promise\`, \`Buffer\`, \`URL\`, \`Headers\`, \`URLSearchParams\`, \`setTimeout\`, \`AbortController\`, \`TextEncoder\`, \`TextDecoder\`, \`FormData\`, \`Blob\`

### Rules

1. Write executable TypeScript code to \`/root/task.ts\`
2. Do NOT use \`import\` or \`require\` — only the globals listed above are available
3. Use \`console.log()\` to output results for the user
4. Use top-level await freely (the script is wrapped in an async IIFE)
5. SDK methods return parsed data directly — no \`.json()\` call needed
6. Handle errors with try/catch and log useful error messages

### SDK Examples

**List connected accounts:**
\`\`\`typescript
const data = await unipile.account.getAll();
console.log(JSON.stringify(data, null, 2));
\`\`\`

### Important

- The script runs on the server with a 15-second timeout
- Write the file to exactly \`/root/task.ts\` — this path is required
- Always output results via \`console.log()\` so the user can see them
- SDK methods return parsed data — do not call \`.json()\` on their results`;

// ── Script executor (inlined from server/sandbox) ───────────────────────────

const ACCOUNT_BLOCKLIST = new Set([
	'connect',
	'reconnect',
	'reconnectWhatsapp',
	'reconnectTelegram',
	'reconnectLinkedin',
	'reconnectLinkedinWithCookie',
	'reconnectInstagram',
	'reconnectTwitter',
	'reconnectMessenger',
	'delete'
]);
const EMAIL_BLOCKLIST = new Set(['delete', 'deleteById', 'deleteByProviderId', 'update']);
const WEBHOOK_BLOCKLIST = new Set(['create', 'delete']);

function createUnipileFacade(dsn: string, apiKey: string) {
	const client = new UnipileClient(`https://${dsn}`, apiKey, { validateRequestPayload: false });

	function bindResource(resource: Record<string, unknown>, blocklist: Set<string> = new Set()) {
		const bound: Record<string, unknown> = {};
		for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(resource))) {
			if (key === 'constructor' || blocklist.has(key)) continue;
			const val = resource[key];
			if (typeof val === 'function') bound[key] = val.bind(resource);
		}
		return bound;
	}

	return {
		account: bindResource(client.account as unknown as Record<string, unknown>, ACCOUNT_BLOCKLIST),
		messaging: bindResource(client.messaging as unknown as Record<string, unknown>),
		email: bindResource(client.email as unknown as Record<string, unknown>, EMAIL_BLOCKLIST),
		users: bindResource(client.users as unknown as Record<string, unknown>),
		webhook: bindResource(client.webhook as unknown as Record<string, unknown>, WEBHOOK_BLOCKLIST)
	};
}

async function executeScript(tsSource: string, dsn: string, apiKey: string) {
	const start = Date.now();
	const logs: string[] = [];

	let jsCode: string;
	try {
		const result = await transform(tsSource, { loader: 'ts', target: 'es2022', format: 'esm' });
		jsCode = result.code;
	} catch (e) {
		return {
			success: false,
			output: '',
			error: `TS transpile failed: ${e instanceof Error ? e.message : String(e)}`,
			durationMs: Date.now() - start
		};
	}

	const unipile = createUnipileFacade(dsn, apiKey);
	const ctx = vm.createContext({
		unipile,
		console: {
			log: (...a: unknown[]) => logs.push(a.map(String).join(' ')),
			warn: (...a: unknown[]) => logs.push(`[warn] ${a.map(String).join(' ')}`),
			error: (...a: unknown[]) => logs.push(`[error] ${a.map(String).join(' ')}`)
		},
		fetch: globalThis.fetch,
		JSON,
		Date,
		Promise,
		Buffer,
		URL,
		Headers,
		Request,
		Response,
		URLSearchParams,
		setTimeout,
		clearTimeout,
		TextEncoder,
		TextDecoder,
		AbortController,
		AbortSignal,
		FormData,
		Blob
	});

	try {
		const script = new vm.Script(`(async () => {\n${jsCode}\n})()`, { filename: 'task.js' });
		const result = await Promise.race([
			script.runInContext(ctx, { timeout: SCRIPT_TIMEOUT_MS }),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Script timed out (15s)')), SCRIPT_TIMEOUT_MS)
			)
		]);
		const output = result !== undefined ? JSON.stringify(result, null, 2) : '';
		const parts = [];
		if (logs.length > 0) parts.push(logs.join('\n'));
		if (output) parts.push(output);
		return { success: true, output: parts.join('\n\n'), durationMs: Date.now() - start };
	} catch (e) {
		return {
			success: false,
			output: logs.join('\n'),
			error: e instanceof Error ? e.message : String(e),
			durationMs: Date.now() - start
		};
	}
}

// ── Main action ─────────────────────────────────────────────────────────────

export const runVibeTask = internalAction({
	args: {
		sandboxId: v.string(),
		prompt: v.string(),
		maxTurns: v.optional(v.number())
	},
	handler: async (_ctx, args) => {
		const { sandboxId, prompt, maxTurns = 2 } = args;
		const t0 = Date.now();

		const apiKey = process.env.DAYTONA_API_KEY;
		if (!apiKey) return { success: false, error: 'DAYTONA_API_KEY not configured' };

		// 1. Check sandbox state, restart if stopped
		const state = await getSandboxState(apiKey, sandboxId);
		console.info(`[runVibeTask] sandbox state=${state} ${Date.now() - t0}ms`);

		if (state === 'stopped') {
			console.info(`[runVibeTask] restarting sandbox`);
			await startSandbox(apiKey, sandboxId);
			console.info(`[runVibeTask] restarted ${Date.now() - t0}ms`);
		}

		// 2. Upload prompt and run vibe
		const augmentedPrompt = buildVibePrompt(prompt);
		const PROMPT_FILE = '/tmp/vibe-prompt.txt';
		await uploadFile(apiKey, sandboxId, PROMPT_FILE, Buffer.from(augmentedPrompt));
		console.info(`[runVibeTask] prompt uploaded ${Date.now() - t0}ms`);

		const cmd = `. /root/.vibe-env && VIBE_PROMPT=$(cat ${PROMPT_FILE}) && vibe -p "$VIBE_PROMPT" --output json --max-turns ${maxTurns} 2>&1`;

		let vibeOutput: string;
		let exitCode: number;

		try {
			const result = await executeCommand(apiKey, sandboxId, cmd, VIBE_TIMEOUT);
			vibeOutput = result.result;
			exitCode = result.exitCode;
			console.info(`[runVibeTask] vibe done exit=${exitCode} ${Date.now() - t0}ms`);
		} catch (e) {
			console.error(`[runVibeTask] vibe error: ${e instanceof Error ? e.message : String(e)}`);
			vibeOutput = e instanceof Error ? e.message : 'Execution failed';
			exitCode = -1;
		}

		const vibeContent = vibeOutput.trim() || `Vibe exited with code ${exitCode} (no output)`;

		// 3. Check for task.ts and execute with Unipile
		let scriptResult: { success: boolean; output: string; error?: string } | null = null;
		const unipileDsn = process.env.UNIPILE_DSN;
		const unipileApiKey = process.env.UNIPILE_API_KEY;

		if (unipileDsn && unipileApiKey) {
			try {
				const taskBuffer = await downloadFile(apiKey, sandboxId, TASK_FILE);
				const tsSource = taskBuffer.toString('utf-8');
				console.info(`[runVibeTask] found task.ts (${tsSource.length} bytes) ${Date.now() - t0}ms`);

				const result = await executeScript(tsSource, unipileDsn, unipileApiKey);
				scriptResult = { success: result.success, output: result.output, error: result.error };
				console.info(`[runVibeTask] script done success=${result.success} ${Date.now() - t0}ms`);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (!msg.includes('404') && !msg.includes('not found') && !msg.includes('No such file')) {
					console.warn(`[runVibeTask] task.ts error: ${msg}`);
				}
			}

			// Cleanup
			try {
				await executeCommand(apiKey, sandboxId, `rm -f ${TASK_FILE}`, 5);
			} catch {
				/* ignore */
			}
		}

		console.info(`[runVibeTask] total ${Date.now() - t0}ms`);

		return {
			success: true,
			vibeOutput: vibeContent.slice(0, 4096),
			scriptResult
		};
	}
});
