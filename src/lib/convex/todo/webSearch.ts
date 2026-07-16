/**
 * Exa web search core.
 *
 * Pure, ToolCtx-free implementation of the agent `webSearch` tool so it can be
 * unit tested with an injected fetch. The createTool wrapper in `agent.ts`
 * delegates to `executeWebSearch`.
 *
 * Exa API: POST https://api.exa.ai/search, header `x-api-key`.
 */

const EXA_SEARCH_URL = 'https://api.exa.ai/search';
const REQUEST_TIMEOUT_MS = 30_000;
const PER_RESULT_MAX_CHARS = 2_000;
const TOTAL_CONTENT_BUDGET = 12_000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Stable, model-facing error codes. Provider bodies never reach the model. */
export type WebSearchErrorCode =
	| 'not_configured'
	| 'invalid_query'
	| 'rate_limited'
	| 'provider_unavailable'
	| 'timeout';

export type WebSearchInput = {
	query: string;
	count?: number;
	recentOnly?: boolean;
};

export type WebSearchResult = {
	title: string;
	url: string;
	published?: string;
	content: string;
};

export type WebSearchOutcome =
	| { success: true; query: string; results: WebSearchResult[] }
	| { success: false; error: WebSearchErrorCode };

export type WebSearchDeps = {
	fetchImpl?: typeof fetch;
	apiKey?: string;
	sleep?: (ms: number) => Promise<void>;
};

type ExaResult = {
	title?: string;
	url: string;
	publishedDate?: string;
	author?: string;
	text?: string;
};

type AttemptResult =
	| { kind: 'success'; results: ExaResult[] }
	| { kind: 'terminal'; code: WebSearchErrorCode }
	| { kind: 'retryable'; code: WebSearchErrorCode; backoffMs: number };

function truncate(value: string, max: number): string {
	return value.length <= max ? value : value.slice(0, max);
}

/** One Exa request. Classifies the outcome without deciding whether to retry. */
async function attemptSearch(
	fetchImpl: typeof fetch,
	apiKey: string,
	body: Record<string, unknown>
): Promise<AttemptResult> {
	let response: Response;
	try {
		response = await fetchImpl(EXA_SEARCH_URL, {
			method: 'POST',
			headers: {
				'x-api-key': apiKey,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
	} catch (err) {
		// AbortSignal.timeout rejects with a TimeoutError DOMException.
		if (err instanceof DOMException && err.name === 'TimeoutError') {
			console.error('[webSearch] Exa request timed out');
			return { kind: 'terminal', code: 'timeout' };
		}
		console.error(
			`[webSearch] Exa network error: ${truncate(err instanceof Error ? err.message : String(err), 500)}`
		);
		return { kind: 'retryable', code: 'provider_unavailable', backoffMs: 0 };
	}

	if (response.ok) {
		const data = (await response.json()) as { results?: ExaResult[] };
		return { kind: 'success', results: data.results ?? [] };
	}

	const rawBody = await response.text().catch(() => '');
	console.error(`[webSearch] Exa ${response.status}: ${truncate(rawBody, 500)}`);

	if (response.status === 429) {
		return { kind: 'retryable', code: 'rate_limited', backoffMs: 2_000 };
	}
	if (response.status >= 500) {
		return { kind: 'retryable', code: 'provider_unavailable', backoffMs: 1_000 };
	}
	// Any other 4xx is a client error we should not retry.
	return { kind: 'terminal', code: 'invalid_query' };
}

/** Map Exa results into the compact tool shape under a hard total content budget. */
function mapResults(results: ExaResult[]): WebSearchResult[] {
	const mapped: WebSearchResult[] = [];
	let remainingBudget = TOTAL_CONTENT_BUDGET;

	for (const result of results) {
		if (remainingBudget <= 0) break;
		const content = truncate(result.text ?? '', remainingBudget);
		remainingBudget -= content.length;
		mapped.push({
			title: result.title ?? result.url,
			url: result.url,
			published: result.publishedDate?.slice(0, 10),
			content
		});
	}

	return mapped;
}

/**
 * Run a web search against Exa with one bounded retry.
 *
 * Retry policy: network failures retry immediately, 429 retries after 2s, 5xx
 * retries after 1s. Timeouts and non-429 4xx are terminal. If the single retry
 * also fails, the retry's mapped code is returned.
 */
export async function executeWebSearch(
	input: WebSearchInput,
	deps: WebSearchDeps = {}
): Promise<WebSearchOutcome> {
	const apiKey = deps.apiKey ?? process.env.EXA_API_KEY;
	if (!apiKey) return { success: false, error: 'not_configured' };

	const fetchImpl = deps.fetchImpl ?? fetch;
	const sleep =
		deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

	const count = input.count ?? 5;
	const body: Record<string, unknown> = {
		query: input.query,
		numResults: count,
		type: 'auto',
		contents: { text: { maxCharacters: PER_RESULT_MAX_CHARS } }
	};
	if (input.recentOnly) {
		body.startPublishedDate = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
	}

	let attempt = await attemptSearch(fetchImpl, apiKey, body);
	if (attempt.kind === 'retryable') {
		if (attempt.backoffMs > 0) await sleep(attempt.backoffMs);
		const retry = await attemptSearch(fetchImpl, apiKey, body);
		// The retry either resolves the request or, if it also fails, gives the
		// final code — a retryable second failure becomes terminal.
		attempt = retry.kind === 'retryable' ? { kind: 'terminal', code: retry.code } : retry;
	}

	if (attempt.kind === 'success') {
		return { success: true, query: input.query, results: mapResults(attempt.results) };
	}
	return { success: false, error: attempt.code };
}
