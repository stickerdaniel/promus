import { Agent, createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { components, internal } from '../_generated/api';
import { getTaskLanguageModel } from '../support/llmProvider';
import type { ToolCtx } from '@convex-dev/agent';

const MAX_VIBE_RESULT = 4096;

function truncate(str: string, max: number): string {
	if (str.length <= max) return str;
	return str.slice(0, max) + '\n\n[truncated]';
}

export const executeVibeTask = createTool({
	description:
		'Delegate Unipile SDK work to the vibe sandbox. Use this when the task involves messaging, email, or contact operations via the Unipile API.',
	args: z.object({
		prompt: z.string().describe('What to do with the Unipile SDK')
	}),
	handler: async (ctx: ToolCtx, args) => {
		const siteUrl = process.env.SITE_URL;
		const internalKey = process.env.SANDBOX_INTERNAL_API_KEY;
		if (!siteUrl || !internalKey) {
			return { success: false, error: 'SITE_URL or SANDBOX_INTERNAL_API_KEY not configured' };
		}

		if (!ctx.userId) {
			return { success: false, error: 'No userId available' };
		}

		// Look up user's sandbox session, retrying if it's still starting
		let session = await ctx.runQuery(components.sandbox.sessions.getUserSession, {
			userId: ctx.userId
		});

		if (session && session.status === 'stopped') {
			return {
				success: false,
				error:
					'Sandbox is stopped. Please restart it from the Sandbox page or reload the Kanban board.'
			};
		}

		if (!session || session.status === 'creating') {
			// Poll up to 6 times (30s total) waiting for sandbox to become ready
			for (let i = 0; i < 6; i++) {
				await new Promise((resolve) => setTimeout(resolve, 5000));
				session = await ctx.runQuery(components.sandbox.sessions.getUserSession, {
					userId: ctx.userId
				});
				if (session && session.status === 'ready') break;
			}
		}

		if (!session || session.status !== 'ready') {
			return {
				success: false,
				error: 'Sandbox is still starting up. Please try again in a moment.'
			};
		}

		try {
			const response = await fetch(`${siteUrl}/api/sandbox/run-internal`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-internal-key': internalKey
				},
				body: JSON.stringify({
					sandboxId: session.sandboxId,
					prompt: args.prompt
				})
			});

			if (!response.ok) {
				const text = await response.text();
				return { success: false, error: `HTTP ${response.status}: ${text}` };
			}

			const result = await response.json();
			return {
				success: true,
				vibeOutput: truncate(result.vibeOutput ?? '', MAX_VIBE_RESULT),
				scriptResult: result.scriptResult
					? {
							success: result.scriptResult.success,
							output: truncate(result.scriptResult.output ?? '', MAX_VIBE_RESULT),
							error: result.scriptResult.error
						}
					: null
			};
		} catch (e) {
			return {
				success: false,
				error: `Fetch failed: ${e instanceof Error ? e.message : String(e)}`
			};
		}
	}
});

export const updateTaskNotes = createTool({
	description: 'Add or update notes on a task. Include the taskId from your system prompt.',
	args: z.object({
		taskId: z.string().describe('The task ID to update'),
		notes: z.string().describe('Notes content to set on the task')
	}),
	handler: async (ctx: ToolCtx, args) => {
		if (!ctx.userId) return { success: false, error: 'No userId' };
		await ctx.runMutation(internal.todos.updateTaskNotesInternal, {
			userId: ctx.userId,
			taskId: args.taskId,
			notes: args.notes
		});
		return { success: true };
	}
});

export const moveTask = createTool({
	description:
		'Move a task to a different column (todo, in-progress, done). Include the taskId from your system prompt.',
	args: z.object({
		taskId: z.string().describe('The task ID to move'),
		columnId: z.enum(['todo', 'in-progress', 'done']).describe('Target column to move the task to')
	}),
	handler: async (ctx: ToolCtx, args) => {
		if (!ctx.userId) return { success: false, error: 'No userId' };
		await ctx.runMutation(internal.todos.moveTaskInternal, {
			userId: ctx.userId,
			taskId: args.taskId,
			columnId: args.columnId
		});
		return { success: true };
	}
});

export const todoAgent = new Agent(components.agent, {
	name: 'Task Assistant',

	languageModel: getTaskLanguageModel() as any,

	instructions: `You are a helpful task assistant with access to tools for managing tasks and delegating Unipile SDK work to a sandbox environment.

Your responsibilities:
- Help users plan and organize their work
- Break complex tasks into actionable steps
- When a task involves Unipile operations (messaging, email, contacts), use the executeVibeTask tool to delegate the work to the sandbox
- Update task notes with findings and progress using updateTaskNotes
- Move tasks between columns (todo → in-progress → done) using moveTask as work progresses

Tool usage:
- executeVibeTask: Use when the task involves Unipile SDK operations (sending messages, reading emails, managing contacts, etc.)
- updateTaskNotes: Use to record findings, progress, or results on the task
- moveTask: Use to move a task to "in-progress" when starting work, and to "done" when complete

Workflow for new tasks:
1. Analyze the task title and notes to understand what's needed
2. If it involves Unipile operations, move to "in-progress" and use executeVibeTask
3. Record results in task notes using updateTaskNotes
4. Move to "done" when complete, or leave in "in-progress" if more work is needed

Communication style:
- Be concise and actionable
- Use bullet points for lists
- Focus on practical next steps
- Summarize tool results clearly`,

	tools: {
		executeVibeTask,
		updateTaskNotes,
		moveTask
	},

	callSettings: {
		temperature: 0.7
	},

	contextOptions: {
		recentMessages: 20
	},

	maxSteps: 8
});
