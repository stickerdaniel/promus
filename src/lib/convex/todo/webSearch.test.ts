import { describe, expect, it } from 'vitest';

import { executeWebSearch } from './webSearch';

function jsonResponse(status: number, body: unknown): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
		text: async () => JSON.stringify(body)
	} as unknown as Response;
}

/** Build a fetch that returns each queued response (or throws a queued error) in order. */
function makeFetch(queue: Array<Response | Error>): {
	impl: typeof fetch;
	state: { calls: number };
} {
	const state = { calls: 0 };
	const impl = (async () => {
		const next = queue[state.calls];
		state.calls += 1;
		if (next === undefined) throw new Error('unexpected extra fetch call');
		// DOMException does not extend Error in Node, so check it explicitly.
		if (next instanceof Error || next instanceof DOMException) throw next;
		return next;
	}) as unknown as typeof fetch;
	return { impl, state };
}

const noopSleep = async () => {};

describe('executeWebSearch', () => {
	it('maps results and enforces the total content budget', async () => {
		const { impl, state } = makeFetch([
			jsonResponse(200, {
				results: [
					{
						title: 'First',
						url: 'https://first.example',
						publishedDate: '2026-01-15T10:00:00.000Z',
						text: 'x'.repeat(15_000)
					},
					{ title: 'Second', url: 'https://second.example', text: 'hello' }
				]
			})
		]);

		const result = await executeWebSearch(
			{ query: 'budget test', count: 5 },
			{ fetchImpl: impl, apiKey: 'key', sleep: noopSleep }
		);

		if (!result.success) throw new Error(`expected success, got ${result.error}`);
		expect(result.query).toBe('budget test');
		// First result eats the whole 12k budget, so the second is dropped.
		expect(result.results).toHaveLength(1);
		expect(result.results[0]).toEqual({
			title: 'First',
			url: 'https://first.example',
			published: '2026-01-15',
			content: 'x'.repeat(12_000)
		});
		expect(state.calls).toBe(1);
	});

	it('falls back to the url when a title is missing and omits an absent date', async () => {
		const { impl } = makeFetch([
			jsonResponse(200, {
				results: [
					{ url: 'https://no-title.example', text: 'body a' },
					{ title: 'Has Title', url: 'https://b.example', text: 'body b' }
				]
			})
		]);

		const result = await executeWebSearch(
			{ query: 'shape' },
			{ fetchImpl: impl, apiKey: 'key', sleep: noopSleep }
		);

		if (!result.success) throw new Error(`expected success, got ${result.error}`);
		expect(result.results).toHaveLength(2);
		expect(result.results[0]).toEqual({
			title: 'https://no-title.example',
			url: 'https://no-title.example',
			published: undefined,
			content: 'body a'
		});
		expect(result.results[1].title).toBe('Has Title');
	});

	it('returns not_configured without touching the network when no key is set', async () => {
		const { impl, state } = makeFetch([]);
		const prev = process.env.EXA_API_KEY;
		delete process.env.EXA_API_KEY;
		try {
			const result = await executeWebSearch(
				{ query: 'no key' },
				{ fetchImpl: impl, sleep: noopSleep }
			);
			expect(result).toEqual({ success: false, error: 'not_configured' });
			expect(state.calls).toBe(0);
		} finally {
			if (prev !== undefined) process.env.EXA_API_KEY = prev;
		}
	});

	it('retries once after a 429 and succeeds', async () => {
		const { impl, state } = makeFetch([
			jsonResponse(429, { error: 'rate limited' }),
			jsonResponse(200, { results: [{ url: 'https://ok.example', text: 'done' }] })
		]);
		const sleeps: number[] = [];

		const result = await executeWebSearch(
			{ query: 'retry' },
			{ fetchImpl: impl, apiKey: 'key', sleep: async (ms) => void sleeps.push(ms) }
		);

		if (!result.success) throw new Error(`expected success, got ${result.error}`);
		expect(result.results).toHaveLength(1);
		expect(state.calls).toBe(2);
		expect(sleeps).toEqual([2_000]);
	});

	it('gives up with rate_limited after two 429 responses', async () => {
		const { impl, state } = makeFetch([
			jsonResponse(429, { error: 'rate limited' }),
			jsonResponse(429, { error: 'rate limited' })
		]);

		const result = await executeWebSearch(
			{ query: 'still limited' },
			{ fetchImpl: impl, apiKey: 'key', sleep: noopSleep }
		);

		expect(result).toEqual({ success: false, error: 'rate_limited' });
		expect(state.calls).toBe(2);
	});

	it('maps a 400 to invalid_query without retrying', async () => {
		const { impl, state } = makeFetch([jsonResponse(400, { error: 'bad request' })]);

		const result = await executeWebSearch(
			{ query: 'bad' },
			{ fetchImpl: impl, apiKey: 'key', sleep: noopSleep }
		);

		expect(result).toEqual({ success: false, error: 'invalid_query' });
		expect(state.calls).toBe(1);
	});

	it('returns timeout immediately without retrying on a TimeoutError', async () => {
		const { impl, state } = makeFetch([new DOMException('timeout', 'TimeoutError')]);

		const result = await executeWebSearch(
			{ query: 'slow' },
			{ fetchImpl: impl, apiKey: 'key', sleep: noopSleep }
		);

		expect(result).toEqual({ success: false, error: 'timeout' });
		expect(state.calls).toBe(1);
	});
});
