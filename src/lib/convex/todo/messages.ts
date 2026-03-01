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

		// 3. Build prompt from task context
		const prompt = [
			`New task created: "${args.taskTitle}"`,
			`Task ID: ${args.taskId}`,
			`Current column: ${args.taskColumn}`,
			args.taskNotes ? `Notes: ${args.taskNotes}` : null,
			'',
			'Analyze this task and take appropriate action. If it involves Unipile operations (messaging, email, contacts), use the executeVibeTask tool. Update task notes with your findings and move the task as appropriate.'
		]
			.filter(Boolean)
			.join('\n');

		// 4. Save the prompt as a user message
		const { messageId } = await todoAgent.saveMessage(ctx, {
			threadId,
			prompt,
			skipEmbeddings: true
		});

		// 5. Run the agent with streaming
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

		// 6. Update task with agent summary
		const summary =
			typeof response === 'object' && response !== null && 'text' in response
				? String((response as { text: string }).text)
				: 'Agent completed analysis.';

		await ctx.runMutation(internal.todos.updateTaskAgentLogsInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentLogs: summary.slice(0, 2000)
		});
	}
});
