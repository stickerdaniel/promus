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
 * Transpile a TypeScript source string and execute it in a sandboxed vm context.
 *
 * The script gets access to:
 * - `unipile` — SDK facade with bound methods (account, messaging, email, users, webhook)
 * - `console.log/warn/error` — captured to logs array
 * - Standard globals: fetch, JSON, Date, Promise, Buffer, URL, Headers, setTimeout, URLSearchParams
 *
 * Blocked: process, require, import, fs, child_process, etc.
 */
export async function executeScript(
	tsSource: string,
	unipileDsn: string,
	unipileApiKey: string
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
	const unipile = createUnipileFacade(unipileDsn, unipileApiKey);

	const capturedConsole = {
		log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
		warn: (...args: unknown[]) => logs.push(`[warn] ${args.map(String).join(' ')}`),
		error: (...args: unknown[]) => logs.push(`[error] ${args.map(String).join(' ')}`)
	};

	const context = vm.createContext({
		unipile,
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
