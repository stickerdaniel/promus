import { internalAction, query } from '../_generated/server';
import { v } from 'convex/values';
import { internal, components } from '../_generated/api';
import { todoAgent } from './agent';
import { paginationOptsValidator } from 'convex/server';
import { listUIMessages, syncStreams } from '@convex-dev/agent';
import { vStreamArgs } from '@convex-dev/agent/validators';
import { authedMutation } from '../functions';
import { getTaskLanguageModelForUser } from '../support/llmProvider';
import { stepCountIs, type FinishReason, type LanguageModelUsage, type ModelMessage } from 'ai';

const TODO_AGENT_ABORT_MS = 9 * 60 * 1000 + 30 * 1000;
const TODO_AGENT_WARNING_MS = 8 * 60 * 1000 + 30 * 1000;
const TODO_AGENT_MAX_STEPS = 24;
const TODO_AGENT_WARNING_STEP = 20;
const TODO_AGENT_TIMEOUT_SUMMARY =
	'Coda ran out of time after partial progress. Review notes and retry if needed.';
const TODO_AGENT_STEP_LIMIT_SUMMARY =
	'Coda stopped after reaching the task step limit. Partial progress was saved.';
const TODO_AGENT_NEAR_LIMIT_REMINDER =
	'System reminder: you are close to the runtime limit. Wrap up now. Record concrete findings, move the task to the right column, and send your final one-sentence summary. Do not start new exploratory work unless it is required to finish.';

type TodoRunOutcome = 'done' | 'timeout' | 'step_limit' | 'error';

type TodoRunMetadata = {
	finishReason?: FinishReason;
	usage?: LanguageModelUsage;
	text: string;
	steps: Array<{
		text?: string;
		toolCalls?: Array<{ toolName?: string; args?: unknown }>;
		toolResults?: Array<{ result?: unknown }>;
	}>;
};

type TodoRunResolution = {
	outcome: TodoRunOutcome;
	status: 'done' | 'error';
	summary: string;
	detail?: string;
};

function toDisplayText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value == null) return '';
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function truncateText(value: unknown, maxLength: number): string {
	const text = toDisplayText(value);
	return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeSummaryText(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object' && 'message' in error) {
		return toDisplayText((error as { message?: unknown }).message) || 'Unknown error';
	}
	return 'Unknown error';
}

function isAbortLikeError(error: unknown): boolean {
	const message = getErrorMessage(error).toLowerCase();
	const name =
		error && typeof error === 'object' && 'name' in error
			? String((error as { name?: unknown }).name ?? '')
			: '';

	return (
		name === 'AbortError' ||
		name === 'TimeoutError' ||
		message.includes('aborted') ||
		message.includes('timeout') ||
		message.includes('timed out')
	);
}

async function collectTodoRunMetadata(result: any): Promise<TodoRunMetadata> {
	const [stepsResult, finishReasonResult, usageResult, textResult] = await Promise.allSettled([
		result.steps,
		result.finishReason,
		result.usage,
		result.text
	]);

	return {
		steps:
			stepsResult.status === 'fulfilled' && Array.isArray(stepsResult.value)
				? stepsResult.value
				: [],
		finishReason: finishReasonResult.status === 'fulfilled' ? finishReasonResult.value : undefined,
		usage: usageResult.status === 'fulfilled' ? usageResult.value : undefined,
		text: textResult.status === 'fulfilled' ? normalizeSummaryText(textResult.value) : ''
	};
}

export function formatTodoAgentDebug(
	data: Partial<TodoRunMetadata>,
	context: { taskId: string; trigger: string }
): string {
	const steps = Array.isArray(data.steps) ? data.steps : [];
	const stepCount = steps.length;
	const toolSummaries: string[] = [];

	for (const [i, step] of steps.entries()) {
		const calls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
		const results = Array.isArray(step.toolResults) ? step.toolResults : [];

		for (const [j, toolCall] of calls.entries()) {
			const toolResult = results[j];
			const resultPreview = toolResult?.result ? truncateText(toolResult.result, 300) : '(empty)';
			toolSummaries.push(
				`  step${i}/${toolCall?.toolName ?? 'unknown'}(${truncateText(toolCall?.args, 200)}) => ${resultPreview}`
			);
		}

		const stepText = normalizeSummaryText(step.text);
		if (calls.length === 0 && stepText) {
			toolSummaries.push(`  step${i}/text: ${truncateText(stepText, 200)}`);
		}
	}

	return [
		`[agent-debug] task=${context.taskId} trigger=${context.trigger}`,
		`  steps=${stepCount} finishReason=${data.finishReason ?? 'unknown'} tokens=${data.usage?.totalTokens ?? '?'}`,
		`  finalText=${truncateText(data.text ?? '', 150)}`,
		...toolSummaries
	].join('\n');
}

export function resolveTodoRunOutcome(args: {
	defaultSummary: string;
	error?: unknown;
	finishReason?: FinishReason;
	steps?: Array<unknown>;
	text?: string;
}): TodoRunResolution {
	const text = normalizeSummaryText(args.text);
	const finishReason = args.finishReason;
	const stepCount = Array.isArray(args.steps) ? args.steps.length : 0;

	if (args.error) {
		const errorMessage = getErrorMessage(args.error);
		if (isAbortLikeError(args.error)) {
			return {
				outcome: 'timeout',
				status: 'error',
				summary: TODO_AGENT_TIMEOUT_SUMMARY,
				detail: `error=${errorMessage}`
			};
		}

		return {
			outcome: 'error',
			status: 'error',
			summary: truncateText(`Coda hit an error: ${errorMessage}`, 120),
			detail: `error=${errorMessage}`
		};
	}

	if (finishReason === 'tool-calls' && stepCount >= TODO_AGENT_MAX_STEPS) {
		return {
			outcome: 'step_limit',
			status: 'error',
			summary: TODO_AGENT_STEP_LIMIT_SUMMARY,
			detail: `finishReason=${finishReason} stepCount=${stepCount}`
		};
	}

	return {
		outcome: 'done',
		status: 'done',
		summary: text || args.defaultSummary
	};
}

export function shouldInjectTodoNearLimitReminder(args: {
	elapsedMs: number;
	stepCount: number;
	reminderSent: boolean;
}): boolean {
	return (
		!args.reminderSent &&
		(args.elapsedMs >= TODO_AGENT_WARNING_MS || args.stepCount >= TODO_AGENT_WARNING_STEP)
	);
}

function createTodoNearLimitReminderMessage(): ModelMessage {
	return {
		role: 'user',
		content: TODO_AGENT_NEAR_LIMIT_REMINDER
	};
}

/** Extract debug info from a streamText result after consumeStream(). */
async function extractAgentDebug(
	result: any,
	context: { taskId: string; trigger: string }
): Promise<string> {
	try {
		const metadata = await collectTodoRunMetadata(result);
		const debug = formatTodoAgentDebug(metadata, context);
		console.log(debug);
		return debug;
	} catch (e) {
		const fallback = `[agent-debug] task=${context.taskId} extraction failed: ${e}`;
		console.log(fallback);
		return fallback;
	}
}

async function runTodoAgentForTask(
	ctx: {
		runMutation: (fn: any, args: any) => Promise<any>;
		runQuery: (fn: any, args: any) => Promise<any>;
		scheduler: { runAfter: (delayMs: number, fn: any, args: any) => Promise<any> };
	},
	args: {
		userId: string;
		taskId: string;
		threadId: string;
		promptMessageId: string;
		trigger: string;
		defaultSummary: string;
		onDone?: () => Promise<void>;
	}
): Promise<TodoRunResolution> {
	const model = await getTaskLanguageModelForUser(ctx as any, args.userId);
	const startedAt = Date.now();
	let nearLimitReminderSent = false;
	const result = await todoAgent.streamText(
		ctx as any,
		{ threadId: args.threadId, userId: args.userId },
		{
			promptMessageId: args.promptMessageId,
			model,
			providerOptions: { openai: { store: false, reasoningEffort: 'medium' } },
			abortSignal: AbortSignal.timeout(TODO_AGENT_ABORT_MS),
			stopWhen: stepCountIs(TODO_AGENT_MAX_STEPS),
			prepareStep: async (options) => {
				if (
					!shouldInjectTodoNearLimitReminder({
						elapsedMs: Date.now() - startedAt,
						stepCount: options.stepNumber,
						reminderSent: nearLimitReminderSent
					})
				) {
					return undefined;
				}

				nearLimitReminderSent = true;
				return {
					messages: [...options.messages, createTodoNearLimitReminderMessage()]
				};
			}
		},
		{
			saveStreamDeltas: {
				chunking: 'line',
				throttleMs: 100
			}
		}
	);

	let metadata: TodoRunMetadata = {
		steps: [],
		text: ''
	};
	let resolution: TodoRunResolution;

	try {
		await result.consumeStream();
		metadata = await collectTodoRunMetadata(result);
		resolution = resolveTodoRunOutcome({
			defaultSummary: args.defaultSummary,
			finishReason: metadata.finishReason,
			steps: metadata.steps,
			text: metadata.text
		});

		if (resolution.outcome === 'done') {
			await args.onDone?.();
		}
	} catch (error) {
		console.error(`Agent failed for task ${args.taskId}:`, error);
		metadata = await collectTodoRunMetadata(result);
		resolution = resolveTodoRunOutcome({
			defaultSummary: args.defaultSummary,
			error,
			finishReason: metadata.finishReason,
			steps: metadata.steps,
			text: metadata.text
		});
	}

	const debug = await extractAgentDebug(result, {
		taskId: args.taskId,
		trigger: args.trigger
	});

	const logLines = [debug, '', `outcome=${resolution.outcome}`, `summary=${resolution.summary}`];
	if (nearLimitReminderSent) {
		logLines.push('nearLimitReminder=sent');
	}
	if (resolution.detail) {
		logLines.push(resolution.detail);
	}

	await ctx.runMutation(internal.todos.updateTaskAgentLogsInternal, {
		userId: args.userId,
		taskId: args.taskId,
		agentLogs: logLines.join('\n').slice(0, 4000)
	});

	await ctx.runMutation(internal.todos.updateTaskAgentStatusInternal, {
		userId: args.userId,
		taskId: args.taskId,
		agentStatus: resolution.status,
		agentSummary: resolution.summary.slice(0, 120)
	});

	// Trigger post-completion cascade to wake deferred tasks
	try {
		const taskInfo = await ctx.runQuery(internal.todos.getTaskThreadInfo, {
			userId: args.userId,
			taskId: args.taskId
		});
		await ctx.scheduler.runAfter(2000, internal.todo.messages.triggerPostCompletionCascade, {
			userId: args.userId,
			completedTaskId: args.taskId,
			completedTaskTitle: taskInfo?.title ?? args.taskId,
			completedTaskSummary: resolution.summary.slice(0, 200),
			completedTaskStatus: resolution.status
		});
	} catch (e) {
		console.error(`Failed to schedule cascade for task ${args.taskId}:`, e);
	}

	return resolution;
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
): Promise<{
	otherTasks: string[];
	columnInfo: string[];
	accountLine: string;
	savedScriptCount: number;
	currentDateTime: string;
}> {
	const userAccountIds: string[] = await ctx.runQuery(
		components.unipile.queries.getUserAccountIds,
		{ userId }
	);

	const [board, columns] = await Promise.all([
		ctx.runQuery(internal.todos.getBoardInternal, { userId }),
		ctx.runQuery(internal.todos.getColumnMetaInternal, { userId })
	]);

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

	const columnMeta = columns as { id: string; name?: string; instructions?: string }[];
	const columnInfo: string[] = ['Lists on the board:'];
	// Use board keys to get all column IDs, merge with metadata
	const allColumnIds = Object.keys(board);
	for (const colId of allColumnIds) {
		const meta = columnMeta.find((c) => c.id === colId);
		const namePart = meta?.name ? ` (name: "${meta.name}")` : '';
		const instrPart = meta?.instructions ? ` — Instructions: "${meta.instructions}"` : '';
		columnInfo.push(`  - ${colId}${namePart}${instrPart}`);
	}

	const accountLine =
		userAccountIds.length > 0
			? `Your Unipile account IDs: ${userAccountIds.join(', ')}`
			: 'No Unipile accounts connected. If this task requires messaging or email, update your notes explaining that a connected account is needed, then move to "prepared".';

	const currentDateTime = new Date().toISOString();

	return { otherTasks, columnInfo, accountLine, savedScriptCount, currentDateTime };
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
		// -1. Deference: skip if another task is already working (unless explicitly triggered)
		if (!args.parentNotification && !args.incomingNotification) {
			const allTasks = await ctx.runQuery(internal.todos.getTasksForCascade, {
				userId: args.userId
			});
			const hasWorking = allTasks.some(
				(t: { id: string; agentStatus?: string }) =>
					t.id !== args.taskId && t.agentStatus === 'working'
			);
			if (hasWorking) {
				console.log(`[cascade] Deferring task ${args.taskId} — another task is already working`);
				return;
			}
		}

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
		const { otherTasks, columnInfo, accountLine, savedScriptCount, currentDateTime } =
			await buildBoardContext(ctx, args.userId, args.taskId);

		// 4. Build prompt
		const truncatedNotes =
			args.taskNotes && args.taskNotes.length > 300
				? args.taskNotes.slice(0, 300) + '... (truncated — use readTaskNotes to see full notes)'
				: args.taskNotes;
		const promptParts: (string | null)[] = [
			`Current date/time: ${currentDateTime}`,
			`You are now the dedicated agent for this task: "${args.taskTitle}"`,
			`Current column: ${args.taskColumn}`,
			truncatedNotes ? `Notes: ${truncatedNotes}` : null,
			'',
			columnInfo.join('\n'),
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

		// 6. Run the agent with guarded execution
		await runTodoAgentForTask(ctx, {
			userId: args.userId,
			taskId: args.taskId,
			threadId,
			promptMessageId: messageId,
			trigger: 'newTask',
			defaultSummary: 'Coda completed analysis.'
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
		const { otherTasks, columnInfo, accountLine, savedScriptCount, currentDateTime } =
			await buildBoardContext(ctx, args.userId, args.taskId);

		const fullPrompt = [
			`Current date/time: ${currentDateTime}`,
			args.prompt,
			'',
			columnInfo.join('\n'),
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

		// 3. Run agent with guarded execution
		await runTodoAgentForTask(ctx, {
			userId: args.userId,
			taskId: args.taskId,
			threadId: args.threadId,
			promptMessageId: messageId,
			trigger: 'taskUpdate',
			defaultSummary: 'Coda processed update.'
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
		const { otherTasks, columnInfo, accountLine, savedScriptCount, currentDateTime } =
			await buildBoardContext(ctx, args.userId, args.taskId);

		const prompt = [
			`Current date/time: ${currentDateTime}`,
			`Notification received for your task: "${args.taskTitle}"`,
			'',
			'Incoming notification(s):',
			...notifLines,
			'',
			'Review these notifications and decide if your task needs updating.',
			'You may update your own notes, move your task, or take no action if irrelevant.',
			'If you need to notify other tasks in response, use notifyTask.',
			'',
			columnInfo.join('\n'),
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

		await runTodoAgentForTask(ctx, {
			userId: args.userId,
			taskId: args.taskId,
			threadId: args.threadId,
			promptMessageId: messageId,
			trigger: 'notification',
			defaultSummary: 'Coda processed notification.',
			onDone: async () => {
				await ctx.runMutation(internal.todo.notifications.clearPendingNotifications, {
					userId: args.userId,
					taskId: args.taskId
				});
			}
		});
	}
});

/**
 * Post-completion cascade: wakes idle tasks after a task finishes.
 * Deferred tasks (in `todo` with no agentStatus) get triggered here.
 */
const MAX_CASCADE_TARGETS = 3;

export const triggerPostCompletionCascade = internalAction({
	args: {
		userId: v.string(),
		completedTaskId: v.string(),
		completedTaskTitle: v.string(),
		completedTaskSummary: v.string(),
		completedTaskStatus: v.string()
	},
	handler: async (ctx, args) => {
		const allTasks = await ctx.runQuery(internal.todos.getTasksForCascade, {
			userId: args.userId
		});

		// Find candidates: todo column, no agentStatus or idle/error, not the completed task
		const candidates = allTasks.filter(
			(t: { id: string; columnId: string; agentStatus?: string }) =>
				t.id !== args.completedTaskId &&
				t.columnId === 'todo' &&
				(!t.agentStatus || t.agentStatus === 'idle' || t.agentStatus === 'error')
		);

		const targets = candidates.slice(0, MAX_CASCADE_TARGETS);

		if (targets.length === 0) {
			console.log(`[cascade] No cascade targets for completed task ${args.completedTaskId}`);
			return;
		}

		console.log(`[cascade] Cascading from ${args.completedTaskId} to ${targets.length} task(s)`);

		const notification = {
			fromTaskId: args.completedTaskId,
			message: `Task "${args.completedTaskTitle}" completed (${args.completedTaskStatus}): ${args.completedTaskSummary}`,
			priority: 'normal'
		};

		for (const target of targets) {
			if (target.threadId) {
				await ctx.scheduler.runAfter(0, internal.todo.messages.triggerAgentForNotification, {
					userId: args.userId,
					threadId: target.threadId,
					taskId: target.id,
					taskTitle: target.title,
					fromTaskId: args.completedTaskId,
					message: notification.message,
					priority: notification.priority
				});
			} else {
				await ctx.scheduler.runAfter(0, internal.todo.messages.triggerAgentForNewTask, {
					userId: args.userId,
					taskId: target.id,
					taskTitle: target.title,
					taskNotes: target.notes,
					taskColumn: target.columnId,
					incomingNotification: notification
				});
			}
		}
	}
});
