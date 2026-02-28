export type TodoItem = {
	id: string;
	title: string;
};

export type ColumnId = 'todo' | 'in-progress' | 'done';

export type KanbanData = Record<ColumnId, TodoItem[]>;
