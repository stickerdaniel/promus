/**
 * Unit tests for the vibe prompt builder.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { buildVibePrompt } from '../vibe-prompt-builder.js';

describe('buildVibePrompt', () => {
	it('includes the user prompt', () => {
		const result = buildVibePrompt('List my accounts');
		expect(result).toContain('List my accounts');
	});

	it('includes SDK method documentation', () => {
		const result = buildVibePrompt('test');
		expect(result).toContain('unipile.account.getAll');
		expect(result).toContain('unipile.messaging.getAllChats');
		expect(result).toContain('unipile.email.getAll');
		expect(result).toContain('unipile.users');
		expect(result).toContain('getProfile');
	});

	it('does not include legacy unipile.fetch', () => {
		const result = buildVibePrompt('test');
		expect(result).not.toContain('unipile.fetch');
	});

	it('instructs to write to /root/task.ts', () => {
		const result = buildVibePrompt('test');
		expect(result).toContain('/root/task.ts');
	});

	it('documents no-import rule', () => {
		const result = buildVibePrompt('test');
		expect(result).toContain('Do NOT use `import` or `require`');
	});

	it('includes console.log instruction', () => {
		const result = buildVibePrompt('test');
		expect(result).toContain('console.log');
	});

	it('includes SDK-style examples', () => {
		const result = buildVibePrompt('test');
		// SDK examples use method calls, not raw fetch paths
		expect(result).toContain('unipile.account.getAll()');
		expect(result).toContain('unipile.messaging.getAllChats');
		expect(result).toContain('unipile.email.send');
		expect(result).toContain('unipile.messaging.sendMessage');
	});

	it('documents that SDK returns parsed data', () => {
		const result = buildVibePrompt('test');
		expect(result).toContain('no `.json()` call needed');
	});

	it('mentions the 15-second timeout', () => {
		const result = buildVibePrompt('test');
		expect(result).toContain('15-second timeout');
	});

	it('separates system context from user request', () => {
		const uniquePrompt = 'UNIQUE_TEST_PROMPT_xyz123';
		const result = buildVibePrompt(uniquePrompt);
		const userRequestIdx = result.indexOf('## User Request');
		const systemIdx = result.indexOf('## Execution Environment');
		expect(systemIdx).toBeLessThan(userRequestIdx);
		expect(result.indexOf(uniquePrompt)).toBeGreaterThan(userRequestIdx);
	});
});
