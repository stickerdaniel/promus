export type AgentStatus = 'idle' | 'working' | 'done' | 'awaiting_approval';
export type AgentDraftType = 'message' | 'email' | 'research';

export type TodoItem = {
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

export type ColumnId = 'todo' | 'working-on' | 'prepared' | 'done';

export type KanbanData = Record<ColumnId, TodoItem[]>;
