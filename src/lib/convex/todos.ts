import { v } from 'convex/values';
import { authedMutation, authedQuery } from './functions';

const COLUMN_IDS = ['todo', 'in-progress', 'done'] as const;

const taskValidator = v.object({
	id: v.string(),
	title: v.string(),
	notes: v.optional(v.string()),
	agentLogs: v.optional(v.string()),
	threadId: v.optional(v.string())
});

const boardValidator = v.record(v.string(), v.array(taskValidator));

type ColumnId = (typeof COLUMN_IDS)[number];
type BoardTask = {
	id: string;
	title: string;
	notes?: string;
	agentLogs?: string;
	threadId?: string;
};
type Board = Record<ColumnId, BoardTask[]>;
type StoredTask = {
	id: string;
	title: string;
	notes?: string;
	agentLogs?: string;
	threadId?: string;
	columnId: ColumnId;
	order: number;
	createdAt: number;
	updatedAt: number;
};

function emptyBoard(): Board {
	return {
		todo: [],
		'in-progress': [],
		done: []
	};
}

function parseBoard(input: Record<string, BoardTask[]>): Board {
	const todo = input.todo;
	const inProgress = input['in-progress'];
	const done = input.done;
	if (!todo || !inProgress || !done) {
		throw new Error('Board must include todo, in-progress, and done columns');
	}

	for (const key of Object.keys(input)) {
		if (!COLUMN_IDS.includes(key as ColumnId)) {
			throw new Error(`Unknown board column: ${key}`);
		}
	}

	return {
		todo,
		'in-progress': inProgress,
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
				...(task.threadId ? { threadId: task.threadId } : {})
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
			tasks.push({
				id,
				title,
				...(notes ? { notes } : {}),
				...(agentLogs ? { agentLogs } : {}),
				...(threadId ? { threadId } : {}),
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
