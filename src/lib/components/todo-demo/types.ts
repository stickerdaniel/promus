export type TodoItem = {
	id: string;
	title: string;
	notes?: string;
	agentLogs?: string;
	threadId?: string;
};

export type ColumnId = 'todo' | 'working-on' | 'prepared' | 'done';

export type KanbanData = Record<ColumnId, TodoItem[]>;
