import { describe, expect, it } from 'vitest';

import {
	formatTodoAgentDebug,
	resolveTodoRunOutcome,
	shouldInjectTodoNearLimitReminder
} from './messages';

describe('resolveTodoRunOutcome', () => {
	it('maps abort errors to an immediate timeout state', () => {
		const outcome = resolveTodoRunOutcome({
			defaultSummary: 'fallback',
			error: new DOMException('The operation was aborted due to timeout.', 'TimeoutError')
		});

		expect(outcome).toMatchObject({
			outcome: 'timeout',
			status: 'error'
		});
		expect(outcome.summary).toContain('ran out of time');
	});

	it('maps capped tool loops to a step-limit state', () => {
		const outcome = resolveTodoRunOutcome({
			defaultSummary: 'fallback',
			finishReason: 'tool-calls',
			steps: Array.from({ length: 24 }, () => ({}))
		});

		expect(outcome).toMatchObject({
			outcome: 'step_limit',
			status: 'error'
		});
		expect(outcome.summary).toContain('step limit');
	});

	it('treats completed runs as done', () => {
		const outcome = resolveTodoRunOutcome({
			defaultSummary: 'fallback',
			finishReason: 'stop',
			steps: [{}, {}],
			text: 'Found the result'
		});

		expect(outcome).toEqual({
			outcome: 'done',
			status: 'done',
			summary: 'Found the result'
		});
	});

	it('maps finishReason=other to error', () => {
		const outcome = resolveTodoRunOutcome({
			defaultSummary: 'fallback',
			finishReason: 'other',
			steps: [{}, {}, {}]
		});

		expect(outcome).toMatchObject({ outcome: 'error', status: 'error' });
		expect(outcome.summary).toContain('stopped unexpectedly');
	});

	it('maps finishReason=length to error', () => {
		const outcome = resolveTodoRunOutcome({
			defaultSummary: 'fallback',
			finishReason: 'length',
			steps: [{}, {}]
		});

		expect(outcome).toMatchObject({ outcome: 'error', status: 'error' });
		expect(outcome.summary).toContain('ran out of response tokens');
	});

	it('maps finishReason=content-filter to error', () => {
		const outcome = resolveTodoRunOutcome({
			defaultSummary: 'fallback',
			finishReason: 'content-filter',
			steps: [{}]
		});

		expect(outcome).toMatchObject({ outcome: 'error', status: 'error' });
		expect(outcome.summary).toContain('content filter');
	});

	it('maps finishReason=error to error', () => {
		const outcome = resolveTodoRunOutcome({
			defaultSummary: 'fallback',
			finishReason: 'error',
			steps: [{}, {}]
		});

		expect(outcome).toMatchObject({ outcome: 'error', status: 'error' });
		expect(outcome.summary).toContain('model error');
	});

	it('uses defaultSummary for finishReason=stop with no text', () => {
		const outcome = resolveTodoRunOutcome({
			defaultSummary: 'Coda finished processing.',
			finishReason: 'stop',
			steps: [{}, {}],
			text: ''
		});

		expect(outcome).toEqual({
			outcome: 'done',
			status: 'done',
			summary: 'Coda finished processing.'
		});
	});

	it('maps finishReason=tool-calls under max steps to done', () => {
		const outcome = resolveTodoRunOutcome({
			defaultSummary: 'fallback',
			finishReason: 'tool-calls',
			steps: [{}, {}, {}],
			text: 'Completed tasks'
		});

		expect(outcome).toEqual({
			outcome: 'done',
			status: 'done',
			summary: 'Completed tasks'
		});
	});
});

describe('shouldInjectTodoNearLimitReminder', () => {
	it('waits until the run is close to the limit', () => {
		expect(
			shouldInjectTodoNearLimitReminder({
				elapsedMs: 2 * 60 * 1000,
				stepCount: 5,
				reminderSent: false
			})
		).toBe(false);
	});

	it('injects once when the time threshold is reached', () => {
		expect(
			shouldInjectTodoNearLimitReminder({
				elapsedMs: 8 * 60 * 1000 + 30 * 1000,
				stepCount: 5,
				reminderSent: false
			})
		).toBe(true);

		expect(
			shouldInjectTodoNearLimitReminder({
				elapsedMs: 9 * 60 * 1000,
				stepCount: 21,
				reminderSent: true
			})
		).toBe(false);
	});

	it('injects when the step threshold is reached', () => {
		expect(
			shouldInjectTodoNearLimitReminder({
				elapsedMs: 60 * 1000,
				stepCount: 20,
				reminderSent: false
			})
		).toBe(true);
	});
});

describe('formatTodoAgentDebug', () => {
	it('handles tool-only steps without throwing', () => {
		const debug = formatTodoAgentDebug(
			{
				steps: [
					{
						toolCalls: [{ toolName: 'webSearch', args: { query: 'foo' } }],
						toolResults: [{ result: { ok: true } }]
					}
				]
			},
			{ taskId: 'task-1', trigger: 'newTask' }
		);

		expect(debug).toContain('step0/webSearch');
		expect(debug).toContain('{"ok":true}');
	});

	it('handles empty final text', () => {
		const debug = formatTodoAgentDebug(
			{
				text: '',
				steps: []
			},
			{ taskId: 'task-2', trigger: 'taskUpdate' }
		);

		expect(debug).toContain('finalText=');
		expect(debug).not.toContain('undefined');
	});

	it('includes both tool and text steps', () => {
		const debug = formatTodoAgentDebug(
			{
				text: 'All done',
				finishReason: 'stop',
				usage: { totalTokens: 42 } as any,
				steps: [
					{
						toolCalls: [{ toolName: 'bash', args: { command: 'echo hi' } }],
						toolResults: [{ result: 'hi' }]
					},
					{
						text: 'Wrapped up the task'
					}
				]
			},
			{ taskId: 'task-3', trigger: 'notification' }
		);

		expect(debug).toContain('steps=2');
		expect(debug).toContain('step0/bash');
		expect(debug).toContain('step1/text: Wrapped up the task');
	});
});
