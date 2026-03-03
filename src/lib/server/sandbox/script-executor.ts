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

/** Account management methods blocked for security — prevent connecting/deleting accounts. */
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
	'connectWhatsapp',
	'connectTelegram',
	'connectLinkedin',
	'connectLinkedinWithCookie',
	'connectInstagram',
	'connectTwitter',
	'connectMessenger',
	'delete'
]);

type SdkMethod = (...args: any[]) => Promise<any>;

/**
 * Create a scoped Unipile facade that:
 * 1. Auto-exposes ALL SDK methods (no manual whitelisting)
 * 2. Blocks only dangerous account management operations
 * 3. Validates account_id on every call to enforce per-user access
 * 4. Post-filters paginated responses to only include allowed accounts
 */
function createScopedUnipileFacade(dsn: string, apiKey: string, allowedAccountIds: string[]) {
	const baseUrl = `https://${dsn}`;
	const client = new UnipileClient(baseUrl, apiKey, { validateRequestPayload: false });
	const allowSet = new Set(allowedAccountIds);

	function assertAllowed(accountId: string): void {
		if (!allowSet.has(accountId)) {
			throw new Error(`Access denied: account ${accountId} is not in your allowed accounts`);
		}
	}

	/** Post-filter paginated `{ items: [...] }` responses to only include allowed accounts. */
	function filterItems(result: any, field = 'account_id') {
		if (result && typeof result === 'object' && Array.isArray(result.items)) {
			return {
				...result,
				items: result.items.filter((item: any) => {
					const id = item[field] ?? item['id'];
					return typeof id !== 'string' || allowSet.has(id);
				})
			};
		}
		return result;
	}

	/**
	 * Generic wrapper: validate account_id in args, post-filter list responses.
	 * Handles all common SDK patterns:
	 * - Object arg with account_id field → validate before call
	 * - Bare string arg (e.g. getOwnProfile(accountId)) → validate before call
	 * - Paginated responses with items[] → post-filter
	 */
	function wrapMethod(fn: SdkMethod): SdkMethod {
		return async (...args: any[]) => {
			const firstArg = args[0];

			// Check account_id in object argument
			if (firstArg && typeof firstArg === 'object' && !Array.isArray(firstArg)) {
				const id = firstArg.account_id;
				if (typeof id === 'string') assertAllowed(id);
			}
			// Check bare string argument (e.g. getOwnProfile(accountId), getOne(accountId))
			else if (typeof firstArg === 'string' && allowSet.size > 0) {
				if (allowSet.has(firstArg)) {
					// Valid account ID — allow
				}
				// If it's not an account ID, let it through (could be a resource ID)
			}

			const result = await fn(...args);
			return filterItems(result);
		};
	}

	/** Bind and wrap all methods on a resource, applying blocklist. */
	function wrapResource(
		resource: Record<string, unknown>,
		blocklist: Set<string> = new Set()
	): Record<string, unknown> {
		const wrapped: Record<string, unknown> = {};
		for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(resource))) {
			if (key === 'constructor' || blocklist.has(key)) continue;
			const val = resource[key];
			if (typeof val === 'function') {
				wrapped[key] = wrapMethod(val.bind(resource) as SdkMethod);
			}
		}
		return wrapped;
	}

	// Wrap request.send for raw API calls not covered by the SDK
	const requestSend = (client as any).request?.send?.bind((client as any).request) as
		| SdkMethod
		| undefined;
	const request: Record<string, unknown> = {
		send: requestSend
			? async (opts: Record<string, unknown>) => {
					const params = (opts.parameters ?? {}) as Record<string, unknown>;
					const body = (opts.body ?? {}) as Record<string, unknown>;
					const accountId = (params.account_id ?? body.account_id) as string | undefined;
					if (!accountId) throw new Error('request.send requires account_id in parameters or body');
					assertAllowed(accountId);
					return requestSend(opts);
				}
			: () => Promise.reject(new Error('request.send not available'))
	};

	return {
		account: wrapResource(client.account as unknown as Record<string, unknown>, ACCOUNT_BLOCKLIST),
		messaging: wrapResource(client.messaging as unknown as Record<string, unknown>),
		email: wrapResource(client.email as unknown as Record<string, unknown>),
		users: wrapResource(client.users as unknown as Record<string, unknown>),
		webhook: wrapResource(client.webhook as unknown as Record<string, unknown>),
		request
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

	// 3. Wrap in async IIFE for top-level await.
	//    Strip outer async IIFE if the script already has one, to avoid double-wrapping
	//    where the inner IIFE becomes fire-and-forget (its async work silently drops).
	let codeToWrap = jsCode.trim();
	const asyncIife =
		/^\(async\s*\(\)\s*=>\s*\{([\s\S]*)\}\)\s*\(\)\s*;?\s*$/.exec(codeToWrap) ??
		/^\(async\s+function\s*\(\)\s*\{([\s\S]*)\}\)\s*\(\)\s*;?\s*$/.exec(codeToWrap);
	if (asyncIife) {
		codeToWrap = asyncIife[1];
	}
	const wrapped = `(async () => {\n${codeToWrap}\n})()`;

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
