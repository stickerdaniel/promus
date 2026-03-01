import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { authedMutation, authedQuery } from './functions';

const COLUMN_IDS = ['todo', 'working-on', 'prepared', 'done'] as const;

const agentStatusValidator = v.optional(
	v.union(
		v.literal('idle'),
		v.literal('working'),
		v.literal('done'),
		v.literal('awaiting_approval')
	)
);
const agentDraftTypeValidator = v.optional(
	v.union(v.literal('message'), v.literal('email'), v.literal('research'))
);

const taskValidator = v.object({
	id: v.string(),
	title: v.string(),
	notes: v.optional(v.string()),
	agentLogs: v.optional(v.string()),
	threadId: v.optional(v.string()),
	agentStatus: agentStatusValidator,
	agentSummary: v.optional(v.string()),
	agentDraft: v.optional(v.string()),
	agentDraftType: agentDraftTypeValidator,
	hasUnreadNotes: v.optional(v.boolean())
});

const boardValidator = v.record(v.string(), v.array(taskValidator));

type ColumnId = (typeof COLUMN_IDS)[number];
type AgentStatus = 'idle' | 'working' | 'done' | 'awaiting_approval';
type AgentDraftType = 'message' | 'email' | 'research';
type BoardTask = {
	id: string;
	title: string;
	notes?: string;
	agentLogs?: string;
	threadId?: string;
	agentStatus?: AgentStatus;
	agentSummary?: string;
	agentDraft?: string;
	agentDraftType?: AgentDraftType;
	hasUnreadNotes?: boolean;
};
type Board = Record<ColumnId, BoardTask[]>;
type StoredTask = {
	id: string;
	title: string;
	notes?: string;
	agentLogs?: string;
	threadId?: string;
	agentStatus?: AgentStatus;
	agentSummary?: string;
	agentDraft?: string;
	agentDraftType?: AgentDraftType;
	hasUnreadNotes?: boolean;
	columnId: ColumnId;
	order: number;
	createdAt: number;
	updatedAt: number;
};

function emptyBoard(): Board {
	return {
		todo: [],
		'working-on': [],
		prepared: [],
		done: []
	};
}

function parseBoard(input: Record<string, BoardTask[]>): Board {
	const todo = input.todo;
	const workingOn = input['working-on'];
	const prepared = input.prepared;
	const done = input.done;
	if (!todo || !workingOn || !prepared || !done) {
		throw new Error('Board must include todo, working-on, prepared, and done columns');
	}

	for (const key of Object.keys(input)) {
		if (!COLUMN_IDS.includes(key as ColumnId)) {
			throw new Error(`Unknown board column: ${key}`);
		}
	}

	return {
		todo,
		'working-on': workingOn,
		prepared,
		done
	};
}

function toBoard(tasks: StoredTask[]): Board {
	const board = emptyBoard();

	for (const columnId of COLUMN_IDS) {
		board[columnId] = tasks
			.filter((task) => task.columnId === columnId)
			.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
			.map((task) => ({
				id: task.id,
				title: task.title,
				...(task.notes ? { notes: task.notes } : {}),
				...(task.agentLogs ? { agentLogs: task.agentLogs } : {}),
				...(task.threadId ? { threadId: task.threadId } : {}),
				...(task.agentStatus ? { agentStatus: task.agentStatus } : {}),
				...(task.agentSummary ? { agentSummary: task.agentSummary } : {}),
				...(task.agentDraft ? { agentDraft: task.agentDraft } : {}),
				...(task.agentDraftType ? { agentDraftType: task.agentDraftType } : {}),
				...(task.hasUnreadNotes ? { hasUnreadNotes: task.hasUnreadNotes } : {})
			}));
	}

	return board;
}

function sanitizeAndFlattenBoard(
	board: Board,
	existingTasksById: Map<string, StoredTask>
): StoredTask[] {
	const now = Date.now();
	const seenIds = new Set<string>();
	const tasks: StoredTask[] = [];

	for (const columnId of COLUMN_IDS) {
		for (const [index, rawTask] of board[columnId].entries()) {
			const id = rawTask.id.trim();
			const title = rawTask.title.trim();
			if (!id) {
				throw new Error('Task id is required');
			}
			if (!title) {
				throw new Error('Task title cannot be empty');
			}
			if (seenIds.has(id)) {
				throw new Error(`Duplicate task id: ${id}`);
			}
			seenIds.add(id);

			const existing = existingTasksById.get(id);
			const notes = rawTask.notes?.trim() || undefined;
			const agentLogs = rawTask.agentLogs?.trim() || existing?.agentLogs || undefined;
			const threadId = rawTask.threadId || existing?.threadId || undefined;
			const agentStatus = rawTask.agentStatus || existing?.agentStatus || undefined;
			const agentSummary = rawTask.agentSummary?.trim() || existing?.agentSummary || undefined;
			const agentDraft = rawTask.agentDraft?.trim() || existing?.agentDraft || undefined;
			const agentDraftType = rawTask.agentDraftType || existing?.agentDraftType || undefined;
			const hasUnreadNotes = rawTask.hasUnreadNotes ?? existing?.hasUnreadNotes ?? undefined;
			tasks.push({
				id,
				title,
				...(notes ? { notes } : {}),
				...(agentLogs ? { agentLogs } : {}),
				...(threadId ? { threadId } : {}),
				...(agentStatus ? { agentStatus } : {}),
				...(agentSummary ? { agentSummary } : {}),
				...(agentDraft ? { agentDraft } : {}),
				...(agentDraftType ? { agentDraftType } : {}),
				...(hasUnreadNotes ? { hasUnreadNotes } : {}),
				columnId,
				order: index,
				createdAt: existing?.createdAt ?? now,
				updatedAt: now
			});
		}
	}

	return tasks;
}

export const getBoard = authedQuery({
	args: {},
	returns: boardValidator,
	handler: async (ctx) => {
		const board = await ctx.db
			.query('todoBoards')
			.withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
			.first();

		if (!board) {
			return emptyBoard();
		}

		return toBoard(board.tasks as StoredTask[]);
	}
});

export const saveBoard = authedMutation({
	args: {
		board: boardValidator
	},
	returns: boardValidator,
	handler: async (ctx, args) => {
		const parsedBoard = parseBoard(args.board as Record<string, BoardTask[]>);
		const existing = await ctx.db
			.query('todoBoards')
			.withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
			.first();

		const existingTasksById = new Map(
			(existing?.tasks as StoredTask[] | undefined)?.map((task) => [task.id, task]) ?? []
		);
		const sanitizedTasks = sanitizeAndFlattenBoard(parsedBoard, existingTasksById);
		const now = Date.now();

		if (existing) {
			await ctx.db.patch(existing._id, {
				tasks: sanitizedTasks,
				updatedAt: now
			});
		} else {
			await ctx.db.insert('todoBoards', {
				userId: ctx.user._id,
				tasks: sanitizedTasks,
				createdAt: now,
				updatedAt: now
			});
		}

		// Detect changes and trigger agent
		for (const task of sanitizedTasks) {
			if (!existingTasksById.has(task.id)) {
				// New task — create thread and trigger agent
				await ctx.scheduler.runAfter(0, internal.todo.messages.triggerAgentForNewTask, {
					userId: ctx.user._id,
					taskId: task.id,
					taskTitle: task.title,
					taskNotes: task.notes,
					taskColumn: task.columnId
				});
			} else {
				const oldTask = existingTasksById.get(task.id)!;

				const columnChanged = task.columnId !== oldTask.columnId;
				const notesChanged = (task.notes ?? '') !== (oldTask.notes ?? '');

				if (!oldTask.threadId) {
					// No thread yet — create one on any meaningful change
					if (columnChanged || notesChanged) {
						await ctx.scheduler.runAfter(0, internal.todo.messages.triggerAgentForNewTask, {
							userId: ctx.user._id,
							taskId: task.id,
							taskTitle: task.title,
							taskNotes: task.notes,
							taskColumn: task.columnId
						});
					}
				} else {
					// Has thread — notify agent of user-initiated changes
					if (columnChanged) {
						await ctx.scheduler.runAfter(0, internal.todo.messages.triggerAgentForTaskUpdate, {
							userId: ctx.user._id,
							threadId: oldTask.threadId,
							taskId: task.id,
							taskTitle: task.title,
							prompt: `User moved task "${task.title}" from "${oldTask.columnId}" to "${task.columnId}". Task ID: ${task.id}. React accordingly — update notes if needed.`
						});
					} else if (notesChanged) {
						await ctx.scheduler.runAfter(0, internal.todo.messages.triggerAgentForTaskUpdate, {
							userId: ctx.user._id,
							threadId: oldTask.threadId,
							taskId: task.id,
							taskTitle: task.title,
							prompt: `User updated notes on task "${task.title}". Task ID: ${task.id}. New notes: ${task.notes ?? '(cleared)'}. Acknowledge and adjust your plan if needed.`
						});
					}
				}
			}
		}

		return toBoard(sanitizedTasks);
	}
});

export const updateTaskThreadId = authedMutation({
	args: {
		taskId: v.string(),
		threadId: v.string()
	},
	handler: async (ctx, args) => {
		const board = await ctx.db
			.query('todoBoards')
			.withIndex('by_user', (q) => q.eq('userId', ctx.user._id))
			.first();

		if (!board) throw new Error('Board not found');

		const tasks = board.tasks as StoredTask[];
		const taskIndex = tasks.findIndex((t) => t.id === args.taskId);
		if (taskIndex === -1) throw new Error('Task not found');

		tasks[taskIndex] = { ...tasks[taskIndex], threadId: args.threadId };

		await ctx.db.patch(board._id, {
			tasks,
			updatedAt: Date.now()
		});
	}
});

// ── Internal mutations (called from agent actions) ──────────────────────────

/** Helper to find board + task by userId + taskId and patch a field */
async function patchTask(
	ctx: { db: any },
	args: { userId: string; taskId: string },
	patch: Partial<StoredTask>
) {
	const board = await ctx.db
		.query('todoBoards')
		.withIndex('by_user', (q: any) => q.eq('userId', args.userId))
		.first();
	if (!board) throw new Error('Board not found');

	const tasks = board.tasks as StoredTask[];
	const idx = tasks.findIndex((t) => t.id === args.taskId);
	if (idx === -1) throw new Error('Task not found');

	tasks[idx] = { ...tasks[idx], ...patch, updatedAt: Date.now() };
	await ctx.db.patch(board._id, { tasks, updatedAt: Date.now() });
}

export const updateTaskThreadIdInternal = internalMutation({
	args: { userId: v.string(), taskId: v.string(), threadId: v.string() },
	handler: async (ctx, args) => {
		await patchTask(ctx, args, { threadId: args.threadId });
	}
});

export const updateTaskAgentLogsInternal = internalMutation({
	args: { userId: v.string(), taskId: v.string(), agentLogs: v.string() },
	handler: async (ctx, args) => {
		await patchTask(ctx, args, { agentLogs: args.agentLogs });
	}
});

export const updateTaskNotesInternal = internalMutation({
	args: { userId: v.string(), taskId: v.string(), notes: v.string() },
	handler: async (ctx, args) => {
		await patchTask(ctx, args, { notes: args.notes, hasUnreadNotes: true });
	}
});

export const moveTaskInternal = internalMutation({
	args: {
		userId: v.string(),
		taskId: v.string(),
		columnId: v.union(
			v.literal('todo'),
			v.literal('working-on'),
			v.literal('prepared'),
			v.literal('done')
		)
	},
	handler: async (ctx, args) => {
		await patchTask(ctx, args, { columnId: args.columnId });
	}
});

export const addTaskInternal = internalMutation({
	args: {
		userId: v.string(),
		title: v.string(),
		notes: v.optional(v.string())
	},
	returns: v.string(),
	handler: async (ctx, args) => {
		const board = await ctx.db
			.query('todoBoards')
			.withIndex('by_user', (q: any) => q.eq('userId', args.userId))
			.first();

		const taskId = crypto.randomUUID();
		const now = Date.now();
		const newTask: StoredTask = {
			id: taskId,
			title: args.title,
			...(args.notes ? { notes: args.notes } : {}),
			columnId: 'todo',
			order: 0,
			createdAt: now,
			updatedAt: now
		};

		if (board) {
			const tasks = board.tasks as StoredTask[];
			const todoTasks = tasks.filter((t) => t.columnId === 'todo');
			newTask.order = todoTasks.length > 0 ? Math.max(...todoTasks.map((t) => t.order)) + 1 : 0;
			await ctx.db.patch(board._id, {
				tasks: [...tasks, newTask],
				updatedAt: now
			});
		} else {
			await ctx.db.insert('todoBoards', {
				userId: args.userId,
				tasks: [newTask],
				createdAt: now,
				updatedAt: now
			});
		}

		return taskId;
	}
});

export const getBoardInternal = internalQuery({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const board = await ctx.db
			.query('todoBoards')
			.withIndex('by_user', (q: any) => q.eq('userId', args.userId))
			.first();

		if (!board) return emptyBoard();
		return toBoard(board.tasks as StoredTask[]);
	}
});

export const updateTaskAgentStatusInternal = internalMutation({
	args: {
		userId: v.string(),
		taskId: v.string(),
		agentStatus: v.union(
			v.literal('idle'),
			v.literal('working'),
			v.literal('done'),
			v.literal('awaiting_approval')
		),
		agentSummary: v.optional(v.string()),
		agentDraft: v.optional(v.string()),
		agentDraftType: v.optional(
			v.union(v.literal('message'), v.literal('email'), v.literal('research'))
		)
	},
	handler: async (ctx, args) => {
		const patch: Partial<StoredTask> = { agentStatus: args.agentStatus };
		if (args.agentSummary !== undefined) patch.agentSummary = args.agentSummary;
		if (args.agentDraft !== undefined) patch.agentDraft = args.agentDraft;
		if (args.agentDraftType !== undefined) patch.agentDraftType = args.agentDraftType;
		await patchTask(ctx, args, patch);
	}
});
