import { internalAction, query } from '../_generated/server';
import { v } from 'convex/values';
import { internal, components } from '../_generated/api';
import { todoAgent } from './agent';
import { paginationOptsValidator } from 'convex/server';
import { listUIMessages, syncStreams } from '@convex-dev/agent';
import { vStreamArgs } from '@convex-dev/agent/validators';
import { authedMutation } from '../functions';

/**
 * Send a user message to a todo task thread
 */
export const sendMessage = authedMutation({
	args: {
		threadId: v.string(),
		prompt: v.string()
	},
	handler: async (ctx, args) => {
		const result = await todoAgent.saveMessage(ctx, {
			threadId: args.threadId,
			prompt: args.prompt,
			skipEmbeddings: true
		});

		await ctx.scheduler.runAfter(0, internal.todo.messages.createAIResponse, {
			threadId: args.threadId,
			promptMessageId: result.messageId,
			userId: ctx.user._id
		});

		return { messageId: result.messageId };
	}
});

/**
 * Generate AI response with streaming
 */
export const createAIResponse = internalAction({
	args: {
		threadId: v.string(),
		promptMessageId: v.string(),
		userId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const result = await todoAgent.streamText(
			ctx,
			{ threadId: args.threadId, userId: args.userId },
			{ promptMessageId: args.promptMessageId },
			{
				saveStreamDeltas: {
					chunking: 'line',
					throttleMs: 100
				}
			}
		);

		await result.consumeStream();
	}
});

/**
 * List messages in a todo thread with streaming support
 */
export const listMessages = query({
	args: {
		threadId: v.string(),
		paginationOpts: paginationOptsValidator,
		streamArgs: vStreamArgs
	},
	handler: async (ctx, args): Promise<unknown> => {
		const paginated = await listUIMessages(ctx, components.agent, {
			threadId: args.threadId,
			paginationOpts: args.paginationOpts
		});

		const streams = await syncStreams(ctx, components.agent, {
			threadId: args.threadId,
			streamArgs: args.streamArgs,
			includeStatuses: ['streaming', 'finished', 'aborted']
		});

		return { ...paginated, page: paginated.page, streams };
	}
});

/**
 * Auto-triggered when a new task is created on the Kanban board.
 * Creates a thread, runs the agent with tools, and updates the task with results.
 */
export const triggerAgentForNewTask = internalAction({
	args: {
		userId: v.string(),
		taskId: v.string(),
		taskTitle: v.string(),
		taskNotes: v.optional(v.string()),
		taskColumn: v.string()
	},
	handler: async (ctx, args) => {
		// 0. Mark task as working
		await ctx.runMutation(internal.todos.updateTaskAgentStatusInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentStatus: 'working'
		});

		// 1. Create a thread for this task
		const { threadId } = await todoAgent.createThread(ctx, {
			userId: args.userId,
			title: args.taskTitle
		});

		// 2. Persist threadId on the task
		await ctx.runMutation(internal.todos.updateTaskThreadIdInternal, {
			userId: args.userId,
			taskId: args.taskId,
			threadId
		});

		// 3. Fetch user's Unipile account IDs
		const userAccountIds: string[] = await ctx.runQuery(
			components.unipile.queries.getUserAccountIds,
			{ userId: args.userId }
		);

		// 4. Fetch full board for context
		const board = await ctx.runQuery(internal.todos.getBoardInternal, {
			userId: args.userId
		});

		const otherTasks: string[] = [];
		for (const [col, tasks] of Object.entries(board)) {
			for (const t of tasks as { id: string; title: string }[]) {
				if (t.id !== args.taskId) {
					otherTasks.push(`  - [${col}] ${t.title} (id: ${t.id})`);
				}
			}
		}

		// 5. Build prompt from task context
		const accountLine =
			userAccountIds.length > 0
				? `Your Unipile account IDs: ${userAccountIds.join(', ')}`
				: 'No Unipile accounts connected. If this task requires messaging or email, create a clarifying sub-task asking the user to connect an account.';

		const prompt = [
			`New task: "${args.taskTitle}"`,
			`Task ID: ${args.taskId}`,
			`Current column: ${args.taskColumn}`,
			args.taskNotes ? `Notes: ${args.taskNotes}` : null,
			'',
			accountLine,
			'',
			otherTasks.length > 0 ? `Other tasks on the board:\n${otherTasks.join('\n')}` : null,
			'',
			'Analyze this task and take appropriate action. If it is vague or missing key details, use createTask to ask the user for the missing info. If it involves Unipile operations, write TypeScript code and use executeUnipileCode. Update task notes with your findings.'
		]
			.filter(Boolean)
			.join('\n');

		// 6. Save the prompt as a user message
		const { messageId } = await todoAgent.saveMessage(ctx, {
			threadId,
			prompt,
			skipEmbeddings: true
		});

		// 7. Run the agent with streaming
		const result = await todoAgent.streamText(
			ctx,
			{ threadId, userId: args.userId },
			{ promptMessageId: messageId },
			{
				saveStreamDeltas: {
					chunking: 'line',
					throttleMs: 100
				}
			}
		);

		const response = await result.consumeStream();

		// 8. Update task with agent summary
		const summary =
			typeof response === 'object' && response !== null && 'text' in response
				? String((response as { text: string }).text)
				: 'Agent completed analysis.';

		await ctx.runMutation(internal.todos.updateTaskAgentLogsInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentLogs: summary.slice(0, 2000)
		});

		// 9. Mark task as done with summary
		await ctx.runMutation(internal.todos.updateTaskAgentStatusInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentStatus: 'done',
			agentSummary: summary.slice(0, 200)
		});
	}
});

/**
 * Triggered when a user updates an existing task (moves it or edits notes).
 * Sends a follow-up message to the task's existing thread.
 */
export const triggerAgentForTaskUpdate = internalAction({
	args: {
		userId: v.string(),
		threadId: v.string(),
		taskId: v.string(),
		taskTitle: v.string(),
		prompt: v.string()
	},
	handler: async (ctx, args) => {
		// 0. Mark task as working
		await ctx.runMutation(internal.todos.updateTaskAgentStatusInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentStatus: 'working'
		});

		// 1. Fetch user's Unipile account IDs
		const userAccountIds: string[] = await ctx.runQuery(
			components.unipile.queries.getUserAccountIds,
			{ userId: args.userId }
		);

		// 2. Fetch board for context
		const board = await ctx.runQuery(internal.todos.getBoardInternal, {
			userId: args.userId
		});

		const otherTasks: string[] = [];
		for (const [col, tasks] of Object.entries(board)) {
			for (const t of tasks as { id: string; title: string }[]) {
				if (t.id !== args.taskId) {
					otherTasks.push(`  - [${col}] ${t.title} (id: ${t.id})`);
				}
			}
		}

		const accountLine =
			userAccountIds.length > 0
				? `Your Unipile account IDs: ${userAccountIds.join(', ')}`
				: 'No Unipile accounts connected.';

		const fullPrompt = [
			args.prompt,
			'',
			accountLine,
			'',
			otherTasks.length > 0 ? `Other tasks on the board:\n${otherTasks.join('\n')}` : null
		]
			.filter(Boolean)
			.join('\n');

		// 3. Save user message to existing thread
		const { messageId } = await todoAgent.saveMessage(ctx, {
			threadId: args.threadId,
			prompt: fullPrompt,
			skipEmbeddings: true
		});

		// 4. Run agent
		const result = await todoAgent.streamText(
			ctx,
			{ threadId: args.threadId, userId: args.userId },
			{ promptMessageId: messageId },
			{
				saveStreamDeltas: {
					chunking: 'line',
					throttleMs: 100
				}
			}
		);

		const response = await result.consumeStream();

		// 5. Update agent logs
		const summary =
			typeof response === 'object' && response !== null && 'text' in response
				? String((response as { text: string }).text)
				: 'Agent processed update.';

		await ctx.runMutation(internal.todos.updateTaskAgentLogsInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentLogs: summary.slice(0, 2000)
		});

		// 6. Mark task as done
		await ctx.runMutation(internal.todos.updateTaskAgentStatusInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentStatus: 'done',
			agentSummary: summary.slice(0, 200)
		});
	}
});
