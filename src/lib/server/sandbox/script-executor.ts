import { transform } from 'esbuild';
import vm from 'node:vm';
import { UnipileClient } from 'unipile-node-sdk';

export interface ExecutionResult {
	success: boolean;
	output: string;
	logs: string[];
	error?: string;
	durationMs: number;
}

const TIMEOUT_MS = 15_000;

/** Methods to exclude from the account resource for security. */
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

/** Methods to exclude from the email resource for security. */
const EMAIL_BLOCKLIST = new Set(['delete', 'deleteById', 'deleteByProviderId', 'update']);

/** Methods to exclude from the webhook resource entirely. */
const WEBHOOK_BLOCKLIST = new Set(['create', 'delete']);

/**
 * Create a facade that exposes bound SDK methods as a plain object,
 * safe for injection into a vm context.
 */
function createUnipileFacade(dsn: string, apiKey: string) {
	const baseUrl = `https://${dsn}`;
	const client = new UnipileClient(baseUrl, apiKey, { validateRequestPayload: false });

	function bindResource(resource: Record<string, unknown>, blocklist: Set<string> = new Set()) {
		const bound: Record<string, unknown> = {};
		for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(resource))) {
			if (key === 'constructor' || blocklist.has(key)) continue;
			const val = resource[key];
			if (typeof val === 'function') {
				bound[key] = val.bind(resource);
			}
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

/**
 * Create a scoped facade that enforces per-user account access control.
 *
 * Every method is wrapped to ensure the agent can only interact with
 * Unipile accounts belonging to the current user.
 */

type SdkMethod = (...args: any[]) => Promise<any>;

function createScopedUnipileFacade(dsn: string, apiKey: string, allowedAccountIds: string[]) {
	const raw = createUnipileFacade(dsn, apiKey);
	const allowSet = new Set(allowedAccountIds);

	function assertAllowed(accountId: string): void {
		if (!allowSet.has(accountId)) {
			throw new Error(`Access denied: account ${accountId} is not in your allowed accounts`);
		}
	}

	/** Filter a paginated `{ items: [...], cursor }` response by a field in the allowlist. */
	function filterItems(
		result: { items: Record<string, unknown>[]; [key: string]: unknown },
		field = 'account_id'
	) {
		return {
			...result,
			items: result.items.filter((item) => {
				const id = item[field];
				return typeof id === 'string' && allowSet.has(id);
			})
		};
	}

	/** Assert a single response object belongs to an allowed account. */
	function validateOwnership(result: Record<string, unknown>, field = 'account_id'): void {
		const id = result[field];
		if (typeof id === 'string' && !allowSet.has(id)) {
			throw new Error(`Access denied: resource belongs to account ${id}`);
		}
	}

	// --- Helpers for common patterns ---

	/** Wrap a method with optional account_id: pre-validate if given, post-filter if omitted. */
	function wrapOptionalAccountId(fn: SdkMethod): (...args: unknown[]) => Promise<unknown> {
		return async (...args: unknown[]) => {
			const input = (args[0] ?? {}) as Record<string, unknown>;
			if (input.account_id && typeof input.account_id === 'string') {
				assertAllowed(input.account_id);
			}
			const result = await fn(...args);
			if (!input.account_id && result && typeof result === 'object' && 'items' in result) {
				return filterItems(result as { items: Record<string, unknown>[]; [key: string]: unknown });
			}
			return result;
		};
	}

	/** Wrap a method with required account_id in the first object arg. */
	function wrapRequiredAccountId(
		fn: SdkMethod,
		field = 'account_id'
	): (...args: unknown[]) => Promise<unknown> {
		return async (...args: unknown[]) => {
			const input = (args[0] ?? {}) as Record<string, unknown>;
			const id = input[field];
			if (typeof id !== 'string') throw new Error(`Missing required ${field}`);
			assertAllowed(id);
			return fn(...args);
		};
	}

	/** Wrap a single-entity lookup: post-fetch validate account_id. */
	function wrapPostFetchValidation(fn: SdkMethod): (...args: unknown[]) => Promise<unknown> {
		return async (...args: unknown[]) => {
			const result = await fn(...args);
			if (result && typeof result === 'object') {
				validateOwnership(result as Record<string, unknown>);
			}
			return result;
		};
	}

	/** Pre-flight chat validation: fetch chat → check account_id → run original method. */
	function wrapChatPreFlight(
		fn: SdkMethod,
		chatIdField = 'chat_id'
	): (...args: unknown[]) => Promise<unknown> {
		return async (...args: unknown[]) => {
			const input = (args[0] ?? {}) as Record<string, unknown>;
			const chatId = input[chatIdField] as string;
			if (!chatId) throw new Error(`Missing required ${chatIdField}`);
			const chat = await (raw.messaging.getChat as SdkMethod)(chatId);
			if (chat && typeof chat === 'object') {
				validateOwnership(chat as Record<string, unknown>);
			}
			return fn(...args);
		};
	}

	// === account — filter by account `id` ===
	const account: Record<string, unknown> = {
		getAll: async (...args: unknown[]) => {
			const result = await (raw.account.getAll as SdkMethod)(...args);
			return filterItems(result, 'id');
		},
		getOne: async (accountId: string) => {
			assertAllowed(accountId);
			return (raw.account.getOne as SdkMethod)(accountId);
		}
	};

	// === messaging ===
	const messaging: Record<string, unknown> = {
		getAllChats: wrapOptionalAccountId(raw.messaging.getAllChats as SdkMethod),
		getChat: wrapPostFetchValidation(raw.messaging.getChat as SdkMethod),
		getAllMessagesFromChat: wrapChatPreFlight(raw.messaging.getAllMessagesFromChat as SdkMethod),
		getMessage: wrapPostFetchValidation(raw.messaging.getMessage as SdkMethod),
		getAllMessages: wrapOptionalAccountId(raw.messaging.getAllMessages as SdkMethod),
		sendMessage: wrapChatPreFlight(raw.messaging.sendMessage as SdkMethod),
		startNewChat: wrapRequiredAccountId(raw.messaging.startNewChat as SdkMethod),
		getAllAttendees: wrapOptionalAccountId(raw.messaging.getAllAttendees as SdkMethod),
		getAttendee: raw.messaging.getAttendee // Low risk — IDs from already-scoped queries
	};

	// === email ===
	const email: Record<string, unknown> = {
		getAll: wrapOptionalAccountId(raw.email.getAll as SdkMethod),
		getOne: wrapPostFetchValidation(raw.email.getOne as SdkMethod),
		getAllFolders: wrapOptionalAccountId(raw.email.getAllFolders as SdkMethod),
		send: wrapRequiredAccountId(raw.email.send as SdkMethod)
	};

	// === users — all methods require account_id ===
	const users: Record<string, unknown> = {
		getProfile: wrapRequiredAccountId(raw.users.getProfile as SdkMethod),
		getOwnProfile: async (accountId: string) => {
			assertAllowed(accountId);
			return (raw.users.getOwnProfile as SdkMethod)(accountId);
		},
		getAllRelations: wrapRequiredAccountId(raw.users.getAllRelations as SdkMethod),
		getAllPosts: wrapRequiredAccountId(raw.users.getAllPosts as SdkMethod),
		getPost: wrapRequiredAccountId(raw.users.getPost as SdkMethod)
	};

	return {
		account,
		messaging,
		email,
		users,
		webhook: raw.webhook // Keep as-is (already heavily blocklisted)
	};
}

/**
 * Transpile a TypeScript source string and execute it in a sandboxed vm context.
 *
 * The script gets access to:
 * - `unipile` — SDK facade with bound methods (account, messaging, email, users, webhook)
 * - `USER_ACCOUNT_IDS` — frozen array of the current user's allowed Unipile account IDs
 * - `console.log/warn/error` — captured to logs array
 * - Standard globals: fetch, JSON, Date, Promise, Buffer, URL, Headers, setTimeout, URLSearchParams
 *
 * Blocked: process, require, import, fs, child_process, etc.
 */
export async function executeScript(
	tsSource: string,
	unipileDsn: string,
	unipileApiKey: string,
	allowedAccountIds: string[]
): Promise<ExecutionResult> {
	const start = Date.now();
	const logs: string[] = [];
	let output = '';

	// 1. Transpile TS → JS
	let jsCode: string;
	try {
		const result = await transform(tsSource, {
			loader: 'ts',
			target: 'es2022',
			format: 'esm'
		});
		jsCode = result.code;
	} catch (e) {
		return {
			success: false,
			output: '',
			logs,
			error: `TypeScript transpilation failed: ${e instanceof Error ? e.message : String(e)}`,
			durationMs: Date.now() - start
		};
	}

	// 2. Build sandboxed context
	const unipile = createScopedUnipileFacade(unipileDsn, unipileApiKey, allowedAccountIds);

	const capturedConsole = {
		log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
		warn: (...args: unknown[]) => logs.push(`[warn] ${args.map(String).join(' ')}`),
		error: (...args: unknown[]) => logs.push(`[error] ${args.map(String).join(' ')}`)
	};

	const context = vm.createContext({
		unipile,
		USER_ACCOUNT_IDS: Object.freeze([...allowedAccountIds]),
		console: capturedConsole,
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

	// 3. Wrap in async IIFE for top-level await
	const wrapped = `(async () => {\n${jsCode}\n})()`;

	// 4. Execute with timeout
	try {
		const script = new vm.Script(wrapped, { filename: 'task.js' });
		const resultPromise = script.runInContext(context, { timeout: TIMEOUT_MS });

		const result = await Promise.race([
			resultPromise,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Script execution timed out (15s)')), TIMEOUT_MS)
			)
		]);

		output = result !== undefined ? JSON.stringify(result, null, 2) : '';
	} catch (e) {
		return {
			success: false,
			output: logs.join('\n'),
			logs,
			error: e instanceof Error ? e.message : String(e),
			durationMs: Date.now() - start
		};
	}

	// Combine console output with return value
	const parts = [];
	if (logs.length > 0) parts.push(logs.join('\n'));
	if (output) parts.push(output);
	const finalOutput = parts.join('\n\n');

	return {
		success: true,
		output: finalOutput,
		logs,
		durationMs: Date.now() - start
	};
}
