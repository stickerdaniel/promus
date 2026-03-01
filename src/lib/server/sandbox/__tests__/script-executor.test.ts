/**
 * Unit tests for the sandbox script executor.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeScript } from '../script-executor.js';

// Fake Unipile credentials for testing
const TEST_DSN = 'test.unipile.com';
const TEST_API_KEY = 'test-api-key-123';

describe('executeScript', () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('TypeScript transpilation', () => {
		it('transpiles and executes valid TypeScript', async () => {
			const result = await executeScript(
				`const x: number = 42;\nconsole.log(x);`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('42');
			expect(result.durationMs).toBeGreaterThanOrEqual(0);
		});

		it('handles type annotations and interfaces', async () => {
			const result = await executeScript(
				`
interface Account { id: string; name: string }
const acc: Account = { id: '1', name: 'Test' };
console.log(acc.name);
`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('Test');
		});

		it('returns error on invalid TypeScript syntax', async () => {
			const result = await executeScript(`const x: number = ;; @@invalid`, TEST_DSN, TEST_API_KEY);

			expect(result.success).toBe(false);
			expect(result.error).toContain('TypeScript transpilation failed');
		});
	});

	describe('console capture', () => {
		it('captures console.log output', async () => {
			const result = await executeScript(
				`console.log('hello'); console.log('world');`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(true);
			expect(result.logs).toEqual(['hello', 'world']);
			expect(result.output).toContain('hello');
			expect(result.output).toContain('world');
		});

		it('captures console.warn with prefix', async () => {
			const result = await executeScript(`console.warn('caution');`, TEST_DSN, TEST_API_KEY);

			expect(result.success).toBe(true);
			expect(result.logs).toEqual(['[warn] caution']);
		});

		it('captures console.error with prefix', async () => {
			const result = await executeScript(`console.error('problem');`, TEST_DSN, TEST_API_KEY);

			expect(result.success).toBe(true);
			expect(result.logs).toEqual(['[error] problem']);
		});

		it('captures multiple arguments in a single log call', async () => {
			const result = await executeScript(`console.log('a', 'b', 123);`, TEST_DSN, TEST_API_KEY);

			expect(result.success).toBe(true);
			expect(result.logs).toEqual(['a b 123']);
		});
	});

	describe('unipile SDK facade', () => {
		it('exposes SDK resource methods on unipile object', async () => {
			fetchSpy.mockResolvedValue(
				new Response(JSON.stringify({ items: [] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const result = await executeScript(
				`
const data = await unipile.account.getAll();
console.log(JSON.stringify(data));
`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(true);
			expect(fetchSpy).toHaveBeenCalled();
			const [url] = fetchSpy.mock.calls[0];
			expect(url).toContain('test.unipile.com');
			expect(url).toContain('/api/');
		});

		it('exposes messaging.getAllChats via SDK', async () => {
			fetchSpy.mockResolvedValue(
				new Response(JSON.stringify({ items: [{ id: 'chat1' }] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const result = await executeScript(
				`
const data = await unipile.messaging.getAllChats({ limit: 5 });
console.log(JSON.stringify(data));
`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(true);
			expect(fetchSpy).toHaveBeenCalled();
		});

		it('exposes email.getAll via SDK', async () => {
			fetchSpy.mockResolvedValue(
				new Response(JSON.stringify({ items: [] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const result = await executeScript(
				`
const data = await unipile.email.getAll({ limit: 10 });
console.log(JSON.stringify(data));
`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(true);
			expect(fetchSpy).toHaveBeenCalled();
		});

		it('does not expose blocked account methods', async () => {
			const result = await executeScript(
				`console.log(typeof unipile.account.delete);`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('undefined');
		});

		it('does not expose blocked email methods', async () => {
			const result = await executeScript(
				`console.log(typeof unipile.email.delete, typeof unipile.email.update);`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('undefined undefined');
		});
	});

	describe('top-level await', () => {
		it('supports Promise chains', async () => {
			const result = await executeScript(
				`
const val = await Promise.resolve(42);
console.log(val);
`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('42');
		});
	});

	describe('sandbox isolation', () => {
		it('does not expose process global', async () => {
			const result = await executeScript(`console.log(typeof process);`, TEST_DSN, TEST_API_KEY);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('undefined');
		});

		it('does not expose require', async () => {
			const result = await executeScript(`console.log(typeof require);`, TEST_DSN, TEST_API_KEY);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('undefined');
		});

		it('does not expose __dirname or __filename', async () => {
			const result = await executeScript(
				`console.log(typeof __dirname, typeof __filename);`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('undefined undefined');
		});

		it('provides standard globals (JSON, Date, URL, Buffer)', async () => {
			const result = await executeScript(
				`
console.log(typeof JSON.stringify);
console.log(typeof Date.now);
console.log(typeof URL);
console.log(typeof Buffer.from);
console.log(typeof Headers);
console.log(typeof URLSearchParams);
`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(true);
			expect(result.logs).toEqual([
				'function',
				'function',
				'function',
				'function',
				'function',
				'function'
			]);
		});
	});

	describe('error handling', () => {
		it('catches runtime errors', async () => {
			const result = await executeScript(
				`throw new Error('something broke');`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain('something broke');
		});

		it('catches reference errors', async () => {
			const result = await executeScript(
				`undeclaredVariable.doSomething();`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		it('preserves logs from before an error', async () => {
			const result = await executeScript(
				`
console.log('before error');
throw new Error('boom');
`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(false);
			expect(result.logs).toContain('before error');
			expect(result.error).toContain('boom');
		});

		it('handles SDK errors gracefully when script catches them', async () => {
			fetchSpy.mockRejectedValue(new Error('network failure'));

			const result = await executeScript(
				`
try {
  await unipile.account.getAll();
} catch (e) {
  console.log('caught: ' + e.message);
}
`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('caught: network failure');
		});
	});

	describe('timeout', () => {
		it('times out on long-running scripts', async () => {
			const result = await executeScript(
				`await new Promise(resolve => setTimeout(resolve, 30000));`,
				TEST_DSN,
				TEST_API_KEY
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain('timed out');
		}, 20_000);
	});

	describe('empty/edge cases', () => {
		it('handles empty script', async () => {
			const result = await executeScript('', TEST_DSN, TEST_API_KEY);
			expect(result.success).toBe(true);
			expect(result.output).toBe('');
		});

		it('handles script with only comments', async () => {
			const result = await executeScript(
				`// this is a comment\n/* block comment */`,
				TEST_DSN,
				TEST_API_KEY
			);
			expect(result.success).toBe(true);
		});
	});
});
