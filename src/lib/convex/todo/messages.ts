import { internalAction, query } from '../_generated/server';
import { v } from 'convex/values';
import { internal, components } from '../_generated/api';
import { todoAgent } from './agent';
import { paginationOptsValidator } from 'convex/server';
import { listUIMessages, syncStreams } from '@convex-dev/agent';
import { vStreamArgs } from '@convex-dev/agent/validators';
import { authedMutation } from '../functions';
import { getTaskLanguageModelForUser } from '../support/llmProvider';

/** Extract debug info from a streamText result after consumeStream(). */
async function extractAgentDebug(
	result: any,
	context: { taskId: string; trigger: string }
): Promise<string> {
	try {
		const steps = await result.steps;
		const finishReason = await result.finishReason;
		const usage = await result.usage;
		const text = (await result.text) || '';

		const stepCount = Array.isArray(steps) ? steps.length : 0;
		const toolSummaries: string[] = [];

		if (Array.isArray(steps)) {
			for (const [i, step] of steps.entries()) {
				const calls = step.toolCalls ?? [];
				const results = step.toolResults ?? [];
				for (const [j, tc] of calls.entries()) {
					const toolResult = results[j];
					let resultPreview = '';
					if (toolResult?.result) {
						const r = toolResult.result;
						const str = typeof r === 'string' ? r : JSON.stringify(r);
						resultPreview = str.length > 300 ? str.slice(0, 300) + '...' : str;
					}
					toolSummaries.push(
						`  step${i}/${tc.toolName}(${JSON.stringify(tc.args).slice(0, 200)}) => ${resultPreview || '(empty)'}`
					);
				}
				if (calls.length === 0 && step.text) {
					toolSummaries.push(`  step${i}/text: ${step.text.slice(0, 200)}`);
				}
			}
		}

		const debug = [
			`[agent-debug] task=${context.taskId} trigger=${context.trigger}`,
			`  steps=${stepCount} finishReason=${finishReason ?? 'unknown'} tokens=${usage?.totalTokens ?? '?'}`,
			`  finalText=${text.slice(0, 150)}`,
			...toolSummaries
		].join('\n');

		console.log(debug);
		return debug;
	} catch (e) {
		const fallback = `[agent-debug] task=${context.taskId} extraction failed: ${e}`;
		console.log(fallback);
		return fallback;
	}
}

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
		if (!args.userId) throw new Error('userId is required for AI responses');
		const model = await getTaskLanguageModelForUser(ctx, args.userId);

		const result = await todoAgent.streamText(
			ctx,
			{ threadId: args.threadId, userId: args.userId },
			{
				promptMessageId: args.promptMessageId,
				model,
				providerOptions: { openai: { store: false, reasoningEffort: 'medium' } }
			},
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
 * Build the board context lines showing other tasks (read-only awareness).
 */
async function buildBoardContext(
	ctx: { runQuery: (fn: any, args: any) => Promise<any> },
	userId: string,
	excludeTaskId: string
): Promise<{ otherTasks: string[]; accountLine: string; savedScriptCount: number }> {
	const userAccountIds: string[] = await ctx.runQuery(
		components.unipile.queries.getUserAccountIds,
		{ userId }
	);

	const board = await ctx.runQuery(internal.todos.getBoardInternal, { userId });

	const savedScripts: Record<string, string> = await ctx.runQuery(
		internal.todo.scripts.getAllScripts,
		{ userId }
	);
	const savedScriptCount = Object.keys(savedScripts).length;

	const otherTasks: string[] = [];
	for (const [col, tasks] of Object.entries(board)) {
		for (const t of tasks as { id: string; title: string }[]) {
			if (t.id !== excludeTaskId) {
				otherTasks.push(`  - [${col}] ${t.title} (id: ${t.id})`);
			}
		}
	}

	const accountLine =
		userAccountIds.length > 0
			? `Your Unipile account IDs: ${userAccountIds.join(', ')}`
			: 'No Unipile accounts connected. If this task requires messaging or email, update your notes explaining that a connected account is needed, then move to "prepared".';

	return { otherTasks, accountLine, savedScriptCount };
}

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
		taskColumn: v.string(),
		parentNotification: v.optional(v.string()),
		incomingNotification: v.optional(
			v.object({
				fromTaskId: v.string(),
				message: v.string(),
				priority: v.string()
			})
		)
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

		// 3. Build board context
		const { otherTasks, accountLine, savedScriptCount } = await buildBoardContext(
			ctx,
			args.userId,
			args.taskId
		);

		// 4. Build prompt
		const promptParts: (string | null)[] = [
			`You are now the dedicated agent for this task: "${args.taskTitle}"`,
			`Current column: ${args.taskColumn}`,
			args.taskNotes ? `Notes: ${args.taskNotes}` : null,
			''
		];

		// Include parent notification (from createTask)
		if (args.parentNotification) {
			promptParts.push(
				'Context from the agent that created this task:',
				args.parentNotification,
				''
			);
		}

		// Include incoming notification (from notifyTask to threadless task)
		if (args.incomingNotification) {
			promptParts.push(
				'Incoming notification from another task:',
				`From task: ${args.incomingNotification.fromTaskId}`,
				`Priority: ${args.incomingNotification.priority}`,
				`Message: ${args.incomingNotification.message}`,
				''
			);
		}

		promptParts.push(
			accountLine,
			savedScriptCount > 0
				? `You have ${savedScriptCount} saved script(s). Use findSavedScripts to check for reusable scripts before writing new ones.`
				: null,
			'',
			otherTasks.length > 0
				? `Other tasks on the board (for awareness — you can notify them but NOT modify them):\n${otherTasks.join('\n')}`
				: null,
			'',
			'Analyze this task and take action immediately. Do NOT ask questions or create clarifying sub-tasks — make reasonable assumptions and proceed. If it involves Unipile operations, use findSavedScripts first, then the bash tool to explore the SDK and execute scripts. Update your task notes with your findings using updateMyNotes.'
		);

		const prompt = promptParts.filter(Boolean).join('\n');

		// 5. Save the prompt as a user message
		const { messageId } = await todoAgent.saveMessage(ctx, {
			threadId,
			prompt,
			skipEmbeddings: true
		});

		// 6. Run the agent with streaming
		const model = await getTaskLanguageModelForUser(ctx, args.userId);
		const result = await todoAgent.streamText(
			ctx,
			{ threadId, userId: args.userId },
			{
				promptMessageId: messageId,
				model,
				providerOptions: { openai: { store: false, reasoningEffort: 'medium' } }
			},
			{
				saveStreamDeltas: {
					chunking: 'line',
					throttleMs: 100
				}
			}
		);

		await result.consumeStream();

		// 7. Debug logging
		const debug = await extractAgentDebug(result, {
			taskId: args.taskId,
			trigger: 'newTask'
		});

		// 8. Update task with agent summary
		const summary = (await result.text) || 'Coda completed analysis.';

		await ctx.runMutation(internal.todos.updateTaskAgentLogsInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentLogs: `${debug}\n\n${summary}`.slice(0, 4000)
		});

		// 9. Mark task as done with summary
		await ctx.runMutation(internal.todos.updateTaskAgentStatusInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentStatus: 'done',
			agentSummary: summary.slice(0, 120)
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

		// 1. Build board context
		const { otherTasks, accountLine, savedScriptCount } = await buildBoardContext(
			ctx,
			args.userId,
			args.taskId
		);

		const fullPrompt = [
			args.prompt,
			'',
			accountLine,
			savedScriptCount > 0
				? `You have ${savedScriptCount} saved script(s). Use findSavedScripts to check for reusable scripts before writing new ones.`
				: null,
			'',
			otherTasks.length > 0
				? `Other tasks on the board (for awareness — you can notify them but NOT modify them):\n${otherTasks.join('\n')}`
				: null
		]
			.filter(Boolean)
			.join('\n');

		// 2. Save user message to existing thread
		const { messageId } = await todoAgent.saveMessage(ctx, {
			threadId: args.threadId,
			prompt: fullPrompt,
			skipEmbeddings: true
		});

		// 3. Run agent
		const model = await getTaskLanguageModelForUser(ctx, args.userId);
		const result = await todoAgent.streamText(
			ctx,
			{ threadId: args.threadId, userId: args.userId },
			{
				promptMessageId: messageId,
				model,
				providerOptions: { openai: { store: false, reasoningEffort: 'medium' } }
			},
			{
				saveStreamDeltas: {
					chunking: 'line',
					throttleMs: 100
				}
			}
		);

		await result.consumeStream();

		// 4. Debug logging
		const debug = await extractAgentDebug(result, {
			taskId: args.taskId,
			trigger: 'taskUpdate'
		});

		// 5. Update agent logs
		const summary = (await result.text) || 'Coda processed update.';

		await ctx.runMutation(internal.todos.updateTaskAgentLogsInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentLogs: `${debug}\n\n${summary}`.slice(0, 4000)
		});

		// 6. Mark task as done
		await ctx.runMutation(internal.todos.updateTaskAgentStatusInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentStatus: 'done',
			agentSummary: summary.slice(0, 120)
		});
	}
});

/**
 * Triggered when another task's agent sends a notification to this task.
 * Wakes the receiving agent to process the notification and decide what to do.
 */
export const triggerAgentForNotification = internalAction({
	args: {
		userId: v.string(),
		threadId: v.string(),
		taskId: v.string(),
		taskTitle: v.string(),
		fromTaskId: v.string(),
		message: v.string(),
		priority: v.string()
	},
	handler: async (ctx, args) => {
		// 0. Check if agent is already working on this task
		const currentStatus = await ctx.runQuery(internal.todos.getTaskAgentStatus, {
			userId: args.userId,
			taskId: args.taskId
		});

		if (currentStatus === 'working') {
			// Agent is busy — queue notification for later delivery
			await ctx.runMutation(internal.todo.notifications.createNotification, {
				userId: args.userId,
				fromTaskId: args.fromTaskId,
				toTaskId: args.taskId,
				message: args.message,
				priority: args.priority as 'low' | 'normal' | 'high',
				depth: 0
			});
			return;
		}

		// 1. Mark task as working
		await ctx.runMutation(internal.todos.updateTaskAgentStatusInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentStatus: 'working'
		});

		// 2. Fetch any queued pending notifications
		const pendingNotifications = await ctx.runQuery(
			internal.todo.notifications.getPendingNotifications,
			{ userId: args.userId, taskId: args.taskId }
		);

		// 3. Build notification prompt
		const allNotifications = [
			{ from: args.fromTaskId, message: args.message, priority: args.priority },
			...pendingNotifications.map(
				(n: { fromTaskId: string; message: string; priority: string }) => ({
					from: n.fromTaskId,
					message: n.message,
					priority: n.priority
				})
			)
		];

		const notifLines = allNotifications.map(
			(n) => `  [${n.priority.toUpperCase()}] From task ${n.from}: ${n.message}`
		);

		// 4. Build board context
		const { otherTasks, accountLine, savedScriptCount } = await buildBoardContext(
			ctx,
			args.userId,
			args.taskId
		);

		const prompt = [
			`Notification received for your task: "${args.taskTitle}"`,
			'',
			'Incoming notification(s):',
			...notifLines,
			'',
			'Review these notifications and decide if your task needs updating.',
			'You may update your own notes, move your task, or take no action if irrelevant.',
			'If you need to notify other tasks in response, use notifyTask.',
			'',
			accountLine,
			savedScriptCount > 0
				? `You have ${savedScriptCount} saved script(s). Use findSavedScripts to check for reusable scripts before writing new ones.`
				: null,
			'',
			otherTasks.length > 0
				? `Other tasks on the board (for awareness only):\n${otherTasks.join('\n')}`
				: null
		]
			.filter(Boolean)
			.join('\n');

		// 5. Save prompt and run agent
		const { messageId } = await todoAgent.saveMessage(ctx, {
			threadId: args.threadId,
			prompt,
			skipEmbeddings: true
		});

		const model = await getTaskLanguageModelForUser(ctx, args.userId);
		const result = await todoAgent.streamText(
			ctx,
			{ threadId: args.threadId, userId: args.userId },
			{
				promptMessageId: messageId,
				model,
				providerOptions: { openai: { store: false, reasoningEffort: 'medium' } }
			},
			{
				saveStreamDeltas: {
					chunking: 'line',
					throttleMs: 100
				}
			}
		);

		await result.consumeStream();

		// 6. Clear pending notifications
		await ctx.runMutation(internal.todo.notifications.clearPendingNotifications, {
			userId: args.userId,
			taskId: args.taskId
		});

		// 7. Debug logging
		const debug = await extractAgentDebug(result, {
			taskId: args.taskId,
			trigger: 'notification'
		});

		// 8. Update agent logs and status
		const summary = (await result.text) || 'Coda processed notification.';

		await ctx.runMutation(internal.todos.updateTaskAgentLogsInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentLogs: `${debug}\n\n${summary}`.slice(0, 4000)
		});

		await ctx.runMutation(internal.todos.updateTaskAgentStatusInternal, {
			userId: args.userId,
			taskId: args.taskId,
			agentStatus: 'done',
			agentSummary: summary.slice(0, 120)
		});
	}
});
