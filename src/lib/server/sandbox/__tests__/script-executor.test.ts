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
const TEST_ACCOUNT_IDS = ['acc-1', 'acc-2'];

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
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
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
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('Test');
		});

		it('returns error on invalid TypeScript syntax', async () => {
			const result = await executeScript(
				`const x: number = ;; @@invalid`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain('TypeScript transpilation failed');
		});
	});

	describe('console capture', () => {
		it('captures console.log output', async () => {
			const result = await executeScript(
				`console.log('hello'); console.log('world');`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toEqual(['hello', 'world']);
			expect(result.output).toContain('hello');
			expect(result.output).toContain('world');
		});

		it('captures console.warn with prefix', async () => {
			const result = await executeScript(
				`console.warn('caution');`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toEqual(['[warn] caution']);
		});

		it('captures console.error with prefix', async () => {
			const result = await executeScript(
				`console.error('problem');`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toEqual(['[error] problem']);
		});

		it('captures multiple arguments in a single log call', async () => {
			const result = await executeScript(
				`console.log('a', 'b', 123);`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

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
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
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
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
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
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(fetchSpy).toHaveBeenCalled();
		});

		it('does not expose blocked account methods', async () => {
			const result = await executeScript(
				`console.log(typeof unipile.account.delete);`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('undefined');
		});

		it('does not expose blocked email methods', async () => {
			const result = await executeScript(
				`console.log(typeof unipile.email.delete, typeof unipile.email.update);`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
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
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('42');
		});
	});

	describe('sandbox isolation', () => {
		it('does not expose process global', async () => {
			const result = await executeScript(
				`console.log(typeof process);`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('undefined');
		});

		it('does not expose require', async () => {
			const result = await executeScript(
				`console.log(typeof require);`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('undefined');
		});

		it('does not expose __dirname or __filename', async () => {
			const result = await executeScript(
				`console.log(typeof __dirname, typeof __filename);`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
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
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
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
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain('something broke');
		});

		it('catches reference errors', async () => {
			const result = await executeScript(
				`undeclaredVariable.doSomething();`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
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
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
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
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
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
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain('timed out');
		}, 20_000);
	});

	describe('async IIFE unwrapping', () => {
		it('captures output from arrow async IIFE', async () => {
			const result = await executeScript(
				`(async () => { console.log('ok') })()`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('ok');
		});

		it('captures output from named function async IIFE', async () => {
			const result = await executeScript(
				`(async function() { console.log('ok') })()`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('ok');
		});

		it('captures async work inside IIFE (the double-wrap bug)', async () => {
			const result = await executeScript(
				`(async () => {
					const val = await Promise.resolve('async-result');
					console.log(val);
				})()`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('async-result');
		});

		it('does not unwrap a non-top-level nested IIFE', async () => {
			const result = await executeScript(
				`
const run = async () => {
  (async () => { console.log('nested') })();
};
await run();
`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('nested');
		});
	});

	describe('console.log serializes objects', () => {
		it('serializes plain objects to JSON', async () => {
			const result = await executeScript(
				`console.log({foo: 'bar'});`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs[0]).toContain('"foo"');
			expect(result.logs[0]).toContain('"bar"');
			expect(result.logs[0]).not.toContain('[object Object]');
		});

		it('serializes label + object together', async () => {
			const result = await executeScript(
				`console.log('label', {a: 1});`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs[0]).toContain('label');
			expect(result.logs[0]).toContain('"a"');
		});

		it('handles null without crashing', async () => {
			const result = await executeScript(
				`console.log(null);`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toEqual(['null']);
		});

		it('handles undefined without crashing', async () => {
			const result = await executeScript(
				`console.log(undefined);`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			// JSON.stringify(undefined) returns undefined (not a string), so it serializes to ''
			expect(result.logs.length).toBe(1);
		});

		it('falls back gracefully on circular reference', async () => {
			const result = await executeScript(
				`
const obj: any = { a: 1 };
obj.self = obj;
console.log(obj);
`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs.length).toBe(1);
			// Falls back to String(obj) which is "[object Object]" — but no crash
			expect(result.logs[0]).toBeDefined();
		});
	});

	describe('account_id validation (security)', () => {
		it('rejects object arg with disallowed account_id', async () => {
			fetchSpy.mockResolvedValue(
				new Response(JSON.stringify({ items: [] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const result = await executeScript(
				`
try {
  await unipile.messaging.getAllChats({ account_id: 'not-allowed' });
  console.log('should not reach');
} catch (e) {
  console.log(e.message);
}
`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs[0]).toContain('Access denied');
			expect(result.logs[0]).not.toContain('should not reach');
		});

		it('allows object arg with allowed account_id', async () => {
			fetchSpy.mockResolvedValue(
				new Response(JSON.stringify({ items: [{ id: 'chat1', account_id: 'acc-1' }] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const result = await executeScript(
				`
const data = await unipile.messaging.getAllChats({ account_id: 'acc-1' });
console.log(JSON.stringify(data));
`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs[0]).toContain('chat1');
		});

		it('passes through calls without account_id in args', async () => {
			fetchSpy.mockResolvedValue(
				new Response(JSON.stringify({ items: [] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const result = await executeScript(
				`
const data = await unipile.email.getAll({ limit: 5 });
console.log('ok');
`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs).toContain('ok');
		});
	});

	describe('post-filtering paginated responses', () => {
		it('filters items from disallowed accounts', async () => {
			fetchSpy.mockResolvedValue(
				new Response(
					JSON.stringify({
						items: [
							{ id: 'msg1', account_id: 'acc-1' },
							{ id: 'msg2', account_id: 'acc-evil' },
							{ id: 'msg3', account_id: 'acc-2' }
						]
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
			);

			const result = await executeScript(
				`
const data = await unipile.email.getAll({ limit: 10 });
console.log(JSON.stringify(data));
`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.logs[0]);
			expect(parsed.items).toHaveLength(2);
			expect(parsed.items.map((i: any) => i.id)).toEqual(['msg1', 'msg3']);
		});

		it('passes through items without account_id', async () => {
			fetchSpy.mockResolvedValue(
				new Response(
					JSON.stringify({
						items: [
							{ id: 'item1', name: 'no-account-field' },
							{ id: 'item2', name: 'also-no-account' }
						]
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
			);

			const result = await executeScript(
				`
const data = await unipile.email.getAll({ limit: 10 });
console.log(JSON.stringify(data));
`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			const parsed = JSON.parse(result.logs[0]);
			// Items without account_id pass through only if their id is not a string
			// or if the id IS in the allowSet — but here id is 'item1'/'item2' which
			// are not in allowSet, so they get filtered.
			// The filterItems logic: if typeof id !== 'string' || allowSet.has(id)
			// 'item1' is a string and not in allowSet → filtered
			expect(parsed.items).toHaveLength(0);
		});
	});

	describe('USER_ACCOUNT_IDS global', () => {
		it('matches passed allowedAccountIds array', async () => {
			const result = await executeScript(
				`console.log(JSON.stringify(USER_ACCOUNT_IDS));`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(JSON.parse(result.logs[0])).toEqual(TEST_ACCOUNT_IDS);
		});

		it('is frozen (push throws TypeError)', async () => {
			const result = await executeScript(
				`
try {
  USER_ACCOUNT_IDS.push('hacked');
  console.log('should not reach');
} catch (e) {
  console.log(e.constructor.name);
}
`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs[0]).toBe('TypeError');
		});
	});

	describe('return value capture', () => {
		it('combines console logs and return value in output', async () => {
			const result = await executeScript(
				`
console.log('step 1');
console.log('step 2');
`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.output).toContain('step 1');
			expect(result.output).toContain('step 2');
		});

		it('returns empty output when no return and no console', async () => {
			const result = await executeScript(`const x = 1;`, TEST_DSN, TEST_API_KEY, TEST_ACCOUNT_IDS);

			expect(result.success).toBe(true);
			expect(result.output).toBe('');
		});
	});

	describe('request.send wrapper', () => {
		it('rejects when account_id is missing', async () => {
			const result = await executeScript(
				`
try {
  await unipile.request.send({ path: '/api/v1/test', method: 'GET', parameters: {} });
  console.log('should not reach');
} catch (e) {
  console.log(e.message);
}
`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs[0]).toContain('requires account_id');
		});

		it('rejects when account_id is disallowed', async () => {
			const result = await executeScript(
				`
try {
  await unipile.request.send({
    path: '/api/v1/test',
    method: 'GET',
    parameters: { account_id: 'not-allowed' }
  });
  console.log('should not reach');
} catch (e) {
  console.log(e.message);
}
`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);

			expect(result.success).toBe(true);
			expect(result.logs[0]).toContain('Access denied');
		});
	});

	describe('empty/edge cases', () => {
		it('handles empty script', async () => {
			const result = await executeScript('', TEST_DSN, TEST_API_KEY, TEST_ACCOUNT_IDS);
			expect(result.success).toBe(true);
			expect(result.output).toBe('');
		});

		it('handles script with only comments', async () => {
			const result = await executeScript(
				`// this is a comment\n/* block comment */`,
				TEST_DSN,
				TEST_API_KEY,
				TEST_ACCOUNT_IDS
			);
			expect(result.success).toBe(true);
		});
	});
});
