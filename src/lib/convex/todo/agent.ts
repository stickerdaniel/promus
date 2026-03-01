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
		if (!ctx.userId) {
			return { success: false, error: 'No userId available' };
		}

		// Look up user's sandbox session, retrying if it's still starting
		let session = await ctx.runQuery(components.sandbox.sessions.getUserSession, {
			userId: ctx.userId
		});

		if (!session || session.status === 'creating') {
			for (let i = 0; i < 6; i++) {
				await new Promise((resolve) => setTimeout(resolve, 5000));
				session = await ctx.runQuery(components.sandbox.sessions.getUserSession, {
					userId: ctx.userId
				});
				if (session && session.status === 'ready') break;
			}
		}

		if (!session || (session.status !== 'ready' && session.status !== 'stopped')) {
			return {
				success: false,
				error: `Sandbox not available (status: ${session?.status ?? 'none'}). Reload the Kanban board.`
			};
		}

		try {
			const result: any = await ctx.runAction(internal.sandboxExecute.runVibeTask, {
				sandboxId: session.sandboxId,
				prompt: args.prompt
			});

			if (!result.success) {
				return { success: false, error: result.error };
			}

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
				error: `Action failed: ${e instanceof Error ? e.message : String(e)}`
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

export const createTask = createTool({
	description:
		'Create a new follow-up task, sub-task, or clarifying question as a todo on the board.',
	args: z.object({
		title: z.string().describe('Title for the new task'),
		notes: z.string().optional().describe('Optional notes or context for the task')
	}),
	handler: async (ctx: ToolCtx, args) => {
		if (!ctx.userId) return { success: false as const, error: 'No userId' };
		const taskId: string = await ctx.runMutation(internal.todos.addTaskInternal, {
			userId: ctx.userId,
			title: args.title,
			notes: args.notes
		});
		return { success: true as const, taskId };
	}
});

export const moveTask = createTool({
	description:
		'Move a task to a different column (todo, working-on, prepared, done). Include the taskId from your system prompt.',
	args: z.object({
		taskId: z.string().describe('The task ID to move'),
		columnId: z
			.enum(['todo', 'working-on', 'prepared', 'done'])
			.describe('Target column to move the task to')
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

Board columns: todo → working-on → prepared → done
- "todo": tasks not yet started
- "working-on": tasks you are actively researching/executing
- "prepared": tasks where all research and drafts are ready, awaiting user confirmation before final execution
- "done": completed tasks

Your responsibilities:
- Help users plan and organize their work
- When a task involves Unipile operations (messaging, email, contacts), use the executeVibeTask tool to delegate the work to the sandbox
- Update task notes with findings and progress using updateTaskNotes
- Move tasks between columns using moveTask as work progresses
- Consider the user's other tasks (provided in context) when analyzing a task — avoid duplicates, notice related work

Tool usage:
- createTask: Use ONLY to ask the user for missing context or clarification. For example, if a task is vague ("plan trip"), create a task like "Decide travel dates for trip" or "Confirm budget for trip". Do NOT use it to break tasks into execution steps — that is your job, not the user's.
- executeVibeTask: Use when the task involves Unipile SDK operations (sending messages, reading emails, managing contacts, etc.)
- updateTaskNotes: Use to record findings, progress, or results on the task
- moveTask: Use to move tasks between columns

Workflow for new tasks:
1. Analyze the task title, notes, and the user's other tasks for context
2. If the task is unclear or missing key info, use createTask to ask the user what you need (e.g. "Specify budget for X", "Confirm recipient for Y")
3. Move to "working-on" and begin research/execution
4. If Unipile work is needed, use executeVibeTask
5. Record results in task notes using updateTaskNotes
6. Move to "prepared" when research/drafts are ready for user review
7. Move to "done" only after successful execution

IMPORTANT — Failure handling:
- If a task fails (sandbox error, API failure, missing info), move it BACK to "todo" using moveTask
- Update the task notes explaining what went wrong and what is needed to retry
- Never leave a failed task in "working-on" or "prepared"

IMPORTANT — Style:
- Never use emojis in notes, task titles, or messages
- Task notes are shown directly to the user — write them in plain, non-technical language
- Keep notes short: 2-4 bullet points max, each one sentence
- Focus on findings and next steps, not implementation details or tool output
- No technical jargon, error codes, API names, or JSON in notes`,

	tools: {
		createTask,
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
