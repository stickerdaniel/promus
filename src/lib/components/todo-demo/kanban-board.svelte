<script lang="ts">
	import {
		DragDropProvider,
		DragOverlay,
		KeyboardSensor,
		PointerSensor
	} from '@dnd-kit-svelte/svelte';
	import { RestrictToWindowEdges } from '@dnd-kit-svelte/svelte/modifiers';
	import { move } from '@dnd-kit/helpers';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { toast } from 'svelte-sonner';
	import { getTranslate } from '@tolgee/svelte';
	import { api } from '$lib/convex/_generated/api';
	import type { KanbanData, ColumnId, TodoItem, AgentStatus, ColumnMeta } from './types.js';
	import KanbanColumn from './kanban-column.svelte';
	import KanbanItem from './kanban-item.svelte';
	import TodoDetailDialog from './todo-detail-dialog.svelte';
	import ColumnEditDialog from './column-edit-dialog.svelte';
	import ChatgptConnectDialog from './chatgpt-connect-dialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { dev } from '$app/environment';
	import { browser } from '$app/environment';

	const DEFAULT_COLUMN_IDS: ColumnId[] = ['todo', 'working-on', 'prepared', 'done'];

	const { t } = getTranslate();
	const convexClient = useConvexClient();

	const sensors = [PointerSensor, KeyboardSensor];
	const boardQuery = useQuery(api.todos.getBoard, {});
	const columnMetaQuery = useQuery(api.todos.getColumnMeta, {});

	let items: KanbanData = $state({
		todo: [],
		'working-on': [],
		prepared: [],
		done: []
	});
	let columnIds: ColumnId[] = $state([...DEFAULT_COLUMN_IDS]);
	let overlayTilted = $state(false);
	let isDragging = $state(false);
	let pendingSaveCount = $state(0);
	let pendingColumnSave = $state(false);
	let dragStartSnapshot = $state<KanbanData | null>(null);
	let dragStartColumnIds = $state<ColumnId[] | null>(null);
	let selectedTaskId = $state<string | null>(null);
	let dialogOpen = $state(false);
	let editingColumnId = $state<string | null>(null);
	let columnEditOpen = $state(false);
	let connectDialogOpen = $state(false);

	// ChatGPT connection check
	const openaiConnection = useQuery(api.openai.getConnection, {});
	const CONNECT_DISMISSED_KEY = 'promus:chatgpt-connect-dismissed';
	let connectPopupDismissed = $state(
		browser ? localStorage.getItem(CONNECT_DISMISSED_KEY) === '1' : false
	);

	let connectDialogWasOpen = $state(false);
	$effect(() => {
		if (connectDialogWasOpen && !connectDialogOpen && !openaiConnection.data) {
			// Dismissed without connecting — don't show again
			connectPopupDismissed = true;
			if (browser) localStorage.setItem(CONNECT_DISMISSED_KEY, '1');
		}
		connectDialogWasOpen = connectDialogOpen;
	});

	let isLoading = $derived(columnMetaQuery.data === undefined);

	let columnMetaMap: Record<string, ColumnMeta> = $derived.by(() => {
		const map: Record<string, ColumnMeta> = {};
		if (columnMetaQuery.data) {
			for (const col of columnMetaQuery.data) {
				map[col.id] = col;
			}
		}
		return map;
	});

	function getColumnTitle(colId: string): string {
		return columnMetaMap[colId]?.name || $t(`todo_demo.column.${colId}`);
	}

	let selectedTask: TodoItem | undefined = $derived.by(() => {
		if (!selectedTaskId) return undefined;
		for (const colId of columnIds) {
			const found = items[colId].find((t) => t.id === selectedTaskId);
			if (found) return found;
		}
		return undefined;
	});

	type SyncEvent = {
		operation: {
			source?: { id?: unknown; type?: unknown } | null;
			target?: { id?: unknown } | null;
		};
	};

	type EndEvent = SyncEvent & {
		suspend: () => { resume: () => void };
	};

	function cloneBoard(board: KanbanData): KanbanData {
		return {
			todo: board.todo.map((t) => ({ ...t })),
			'working-on': board['working-on'].map((t) => ({ ...t })),
			prepared: board.prepared.map((t) => ({ ...t })),
			done: board.done.map((t) => ({ ...t }))
		};
	}

	function isSameBoard(a: KanbanData, b: KanbanData): boolean {
		for (const columnId of columnIds) {
			if (a[columnId].length !== b[columnId].length) {
				return false;
			}
			for (const [index, task] of a[columnId].entries()) {
				const other = b[columnId][index];
				if (!other || other.id !== task.id || other.title !== task.title) {
					return false;
				}
			}
		}
		return true;
	}

	function createTaskId(): string {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID();
		}
		return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	$effect(() => {
		if (!boardQuery.data || isDragging || pendingSaveCount > 0) return;
		items = cloneBoard(boardQuery.data);
	});

	// Sync column order from metadata query
	$effect(() => {
		if (!columnMetaQuery.data || isDragging || pendingColumnSave) return;
		const metaIds = columnMetaQuery.data
			.map((c) => c.id)
			.filter((id) => DEFAULT_COLUMN_IDS.includes(id as ColumnId));
		if (metaIds.length > 0) {
			// Add any default columns not in metadata at the end
			const remaining = DEFAULT_COLUMN_IDS.filter((id) => !metaIds.includes(id));
			columnIds = [...metaIds, ...remaining] as ColumnId[];
		} else {
			columnIds = [...DEFAULT_COLUMN_IDS];
		}
	});

	function syncItemOrder(event: SyncEvent) {
		const { source, target } = event.operation;
		if (!source || !target) return;

		if (source.type === 'column') {
			// Column reorder
			const sourceId = String(source.id);
			const targetId = String(target.id);
			const fromIdx = columnIds.indexOf(sourceId as ColumnId);
			const toIdx = columnIds.indexOf(targetId as ColumnId);
			if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
			const next = [...columnIds];
			const [removed] = next.splice(fromIdx, 1);
			next.splice(toIdx, 0, removed);
			columnIds = next;
			return;
		}

		items = move(items, event as any) as KanbanData;
	}

	async function persistBoard(nextBoard: KanbanData, rollbackBoard: KanbanData): Promise<void> {
		const nextSnapshot = cloneBoard(nextBoard);
		const rollbackSnapshot = cloneBoard(rollbackBoard);
		pendingSaveCount += 1;

		try {
			await convexClient.mutation(
				api.todos.saveBoard,
				{ board: nextSnapshot },
				{
					optimisticUpdate: (store) => {
						store.setQuery(api.todos.getBoard, {}, nextSnapshot);
					}
				}
			);
		} catch (error) {
			console.error('[kanban] Failed to save board:', error);
			items = rollbackSnapshot;
			toast.error($t('todo_demo.save_failed'));
		} finally {
			pendingSaveCount = Math.max(0, pendingSaveCount - 1);
		}
	}

	async function addTodo(columnId: ColumnId, title: string): Promise<void> {
		const trimmed = title.trim();
		if (!trimmed) return;

		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		nextBoard[columnId] = [
			...nextBoard[columnId],
			{
				id: createTaskId(),
				title: trimmed
			}
		];
		items = nextBoard;
		await persistBoard(nextBoard, rollbackBoard);

		// Prompt to connect ChatGPT if not connected and not already dismissed
		if (!openaiConnection.data && !connectPopupDismissed) {
			connectDialogOpen = true;
		}
	}

	function handleTaskClick(task: TodoItem) {
		selectedTaskId = task.id;
		dialogOpen = true;

		if (task.hasUnreadNotes) {
			const rollbackBoard = cloneBoard(items);
			const nextBoard = cloneBoard(items);
			for (const colId of columnIds) {
				const idx = nextBoard[colId].findIndex((t) => t.id === task.id);
				if (idx !== -1) {
					nextBoard[colId][idx] = { ...nextBoard[colId][idx], hasUnreadNotes: false };
					break;
				}
			}
			items = nextBoard;
			void persistBoard(nextBoard, rollbackBoard);
		}
	}

	async function handleTaskSave(id: string, updates: { title: string; notes?: string }) {
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		for (const colId of columnIds) {
			const idx = nextBoard[colId].findIndex((t) => t.id === id);
			if (idx !== -1) {
				nextBoard[colId][idx] = { ...nextBoard[colId][idx], ...updates };
				break;
			}
		}
		items = nextBoard;
		await persistBoard(nextBoard, rollbackBoard);
	}

	async function handleTaskDelete(id: string) {
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		for (const colId of columnIds) {
			nextBoard[colId] = nextBoard[colId].filter((t) => t.id !== id);
		}
		items = nextBoard;
		await persistBoard(nextBoard, rollbackBoard);
	}

	async function handleAgentApprove(id: string) {
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		for (const colId of columnIds) {
			const idx = nextBoard[colId].findIndex((t) => t.id === id);
			if (idx !== -1) {
				nextBoard[colId][idx] = {
					...nextBoard[colId][idx],
					agentStatus: 'done' as AgentStatus,
					agentDraft: undefined,
					agentDraftType: undefined
				};
				break;
			}
		}
		items = nextBoard;
		dialogOpen = false;
		await persistBoard(nextBoard, rollbackBoard);
	}

	async function handleAgentReject(id: string, feedback: string) {
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		for (const colId of columnIds) {
			const idx = nextBoard[colId].findIndex((t) => t.id === id);
			if (idx !== -1) {
				nextBoard[colId][idx] = {
					...nextBoard[colId][idx],
					agentStatus: 'working' as AgentStatus,
					agentDraft: undefined,
					agentDraftType: undefined,
					notes: feedback
				};
				break;
			}
		}
		items = nextBoard;
		dialogOpen = false;
		await persistBoard(nextBoard, rollbackBoard);
	}

	async function handleAgentRetry(id: string) {
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		for (const colId of columnIds) {
			const idx = nextBoard[colId].findIndex((t) => t.id === id);
			if (idx !== -1) {
				nextBoard[colId][idx] = {
					...nextBoard[colId][idx],
					agentStatus: 'idle' as AgentStatus,
					agentSummary: undefined
				};
				break;
			}
		}
		items = nextBoard;
		dialogOpen = false;
		await persistBoard(nextBoard, rollbackBoard);
	}

	async function handleBlockAction(taskId: string, threadId: string, action: string) {
		dialogOpen = false;
		try {
			await convexClient.mutation(api.todo.messages.sendMessage, {
				threadId,
				prompt: `User action from UI: ${action}`
			});
		} catch (error) {
			console.error('[kanban] Failed to send block action:', error);
			toast.error($t('todo_demo.save_failed'));
		}
	}

	function mockAgentStatus(status: AgentStatus) {
		if (!items.todo.length) return;
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		nextBoard.todo[0] = {
			...nextBoard.todo[0],
			agentStatus: status,
			agentSummary:
				status === 'done' ? 'Analysis complete. Found 3 potential contacts.' : undefined,
			agentDraft:
				status === 'awaiting_approval'
					? 'Hi! I noticed we both attended the hackathon. Would love to connect!'
					: undefined,
			agentDraftType: status === 'awaiting_approval' ? 'message' : undefined
		};
		items = nextBoard;
		void persistBoard(nextBoard, rollbackBoard);
	}

	function mockAgentSpec() {
		if (!items.todo.length) return;
		const spec = JSON.stringify({
			root: 'container',
			elements: {
				container: {
					type: 'Stack',
					props: { direction: 'vertical', gap: 'md' },
					children: ['heading', 'grid', 'summary']
				},
				heading: {
					type: 'Heading',
					props: { text: 'Top Picks', level: 'h3' },
					children: []
				},
				grid: {
					type: 'Grid',
					props: { columns: '2', gap: 'md' },
					children: ['card1', 'card2']
				},
				card1: {
					type: 'Card',
					props: { title: 'Roborock S8 Pro Ultra', description: '$1,399' },
					children: ['desc1', 'link1']
				},
				desc1: {
					type: 'Text',
					props: {
						content: 'Self-emptying, self-washing dock. Best overall for large homes with pets.'
					},
					children: []
				},
				link1: {
					type: 'Link',
					props: { text: 'View on Amazon', href: 'https://amazon.com' },
					children: []
				},
				card2: {
					type: 'Card',
					props: { title: 'iRobot Roomba j7+', description: '$599' },
					children: ['desc2', 'link2']
				},
				desc2: {
					type: 'Text',
					props: { content: 'Smart obstacle avoidance. Great value pick for apartments.' },
					children: []
				},
				link2: {
					type: 'Link',
					props: { text: 'View on Amazon', href: 'https://amazon.com' },
					children: []
				},
				summary: {
					type: 'Text',
					props: {
						content: 'Pick the one you prefer and Coda will handle the order.',
						muted: true
					},
					children: []
				}
			},
			state: {}
		});
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		nextBoard.todo[0] = {
			...nextBoard.todo[0],
			agentSpec: spec,
			agentStatus: 'done' as AgentStatus,
			agentSummary: 'Coda found 2 top robot vacuums. Pick your favorite.',
			notes:
				'- Coda researched robot vacuums in your budget\n- Found 2 strong options\n- Pick your preferred model below'
		};
		items = nextBoard;
		void persistBoard(nextBoard, rollbackBoard);
	}

	function findTaskPosition(taskId: string): { colIdx: number; taskIdx: number } | null {
		for (let c = 0; c < columnIds.length; c++) {
			const col = items[columnIds[c]];
			for (let t = 0; t < col.length; t++) {
				if (col[t].id === taskId) return { colIdx: c, taskIdx: t };
			}
		}
		return null;
	}

	function focusTask(colIdx: number, taskIdx: number) {
		const col = items[columnIds[colIdx]];
		if (!col?.length) return;
		const clampedIdx = Math.min(taskIdx, col.length - 1);
		const task = col[clampedIdx];
		const el = document.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`);
		el?.focus();
	}

	function handleBoardKeydown(e: KeyboardEvent) {
		if (dialogOpen || isDragging) return;

		const active = document.activeElement;
		const taskId = active?.getAttribute('data-task-id');
		if (!taskId) return;

		const pos = findTaskPosition(taskId);
		if (!pos) return;

		switch (e.key) {
			case 'ArrowDown': {
				e.preventDefault();
				const col = items[columnIds[pos.colIdx]];
				if (pos.taskIdx < col.length - 1) {
					focusTask(pos.colIdx, pos.taskIdx + 1);
				}
				break;
			}
			case 'ArrowUp': {
				e.preventDefault();
				if (pos.taskIdx > 0) {
					focusTask(pos.colIdx, pos.taskIdx - 1);
				}
				break;
			}
			case 'ArrowRight': {
				e.preventDefault();
				for (let c = pos.colIdx + 1; c < columnIds.length; c++) {
					if (items[columnIds[c]].length > 0) {
						focusTask(c, pos.taskIdx);
						break;
					}
				}
				break;
			}
			case 'ArrowLeft': {
				e.preventDefault();
				for (let c = pos.colIdx - 1; c >= 0; c--) {
					if (items[columnIds[c]].length > 0) {
						focusTask(c, pos.taskIdx);
						break;
					}
				}
				break;
			}
		}
	}

	async function handleDragEnd(event: EndEvent): Promise<void> {
		syncItemOrder(event);
		overlayTilted = false;
		isDragging = false;

		// Let overlay re-render without tilt before drop animation snapshot is taken.
		const suspended = event.suspend();
		requestAnimationFrame(() => suspended.resume());

		// Check for column order change
		const startCols = dragStartColumnIds;
		dragStartColumnIds = null;
		if (startCols && startCols.join(',') !== columnIds.join(',')) {
			pendingColumnSave = true;
			try {
				await convexClient.mutation(api.todos.saveColumnOrder, {
					columnIds: [...columnIds]
				});
			} catch (error) {
				console.error('[kanban] Failed to save column order:', error);
				columnIds = startCols;
				toast.error($t('todo_demo.save_failed'));
			} finally {
				pendingColumnSave = false;
			}
		}

		const startBoard = dragStartSnapshot;
		dragStartSnapshot = null;
		if (!startBoard) return;

		const nextBoard = cloneBoard(items);
		if (isSameBoard(startBoard, nextBoard)) return;

		await persistBoard(nextBoard, startBoard);
	}
</script>

<svelte:window onkeydown={handleBoardKeydown} />

<div>
	<DragDropProvider
		{sensors}
		modifiers={[RestrictToWindowEdges]}
		onDragStart={() => {
			dragStartSnapshot = cloneBoard(items);
			dragStartColumnIds = [...columnIds];
			overlayTilted = true;
			isDragging = true;
		}}
		onDragEnd={(event) => {
			void handleDragEnd(event as EndEvent);
		}}
		onDragOver={syncItemOrder}
	>
		{#if isLoading}
			<div class="grid items-start gap-3 md:grid-cols-4">
				{#each { length: 4 } as _, i (i)}
					<div
						class="rounded-xl border border-border/80 bg-muted/45 p-3 dark:border-border/60 dark:bg-card/95"
					>
						<div class="flex items-center justify-between px-1 pb-3">
							<Skeleton class="h-4 w-24" />
							<div class="flex items-center gap-0.5">
								<div class="rounded p-1 text-foreground/70">
									<PencilIcon class="size-3.5" />
								</div>
								<div class="rounded p-1 text-foreground/70">
									<GripVerticalIcon class="size-4" />
								</div>
							</div>
						</div>
						<div class="grid min-h-0 gap-2">
							<Skeleton class="h-11 w-full rounded-lg" />
							<Skeleton class="h-11 w-full rounded-lg" />
						</div>
						<button
							class="mt-2 flex w-full items-center rounded-lg px-2 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted/70 hover:text-foreground dark:text-foreground/75 dark:hover:bg-background"
							disabled
						>
							<span class="flex items-center gap-1">
								<PlusIcon class="size-4" />
								{$t('todo_demo.add_card')}
							</span>
						</button>
					</div>
				{/each}
			</div>
		{:else}
			<div class="grid items-start gap-3 md:grid-cols-4">
				{#each columnIds as columnId, colIdx (columnId)}
					<KanbanColumn
						id={columnId}
						title={getColumnTitle(columnId)}
						index={colIdx}
						onAdd={(title) => addTodo(columnId, title)}
						onEdit={() => {
							editingColumnId = columnId;
							columnEditOpen = true;
						}}
						editAriaLabel={$t('todo_demo.column_edit.aria_edit')}
					>
						{#each items[columnId] as task, taskIdx (task.id)}
							<KanbanItem
								{task}
								index={taskIdx}
								group={columnId}
								data={{ group: columnId }}
								onclick={handleTaskClick}
							/>
						{/each}
					</KanbanColumn>
				{/each}
			</div>
		{/if}

		<DragOverlay>
			{#snippet children(source)}
				{#if source.data.group}
					{@const task = items[source.data.group as ColumnId]?.find((t) => t.id === source.id)}
					{#if task}
						<KanbanItem {task} index={0} isOverlay {overlayTilted} />
					{/if}
				{:else}
					{@const colId = source.id as ColumnId}
					<KanbanColumn
						id={colId}
						title={getColumnTitle(colId)}
						index={0}
						isOverlay
						{overlayTilted}
						onAdd={() => {}}
					>
						{#each items[colId] as task, taskIdx (task.id)}
							<KanbanItem {task} index={taskIdx} group={colId} data={{ group: colId }} />
						{/each}
					</KanbanColumn>
				{/if}
			{/snippet}
		</DragOverlay>
	</DragDropProvider>

	{#if dev}
		<div
			class="mt-4 flex flex-wrap gap-2 rounded-md border border-dashed border-muted-foreground/30 p-3"
		>
			<span class="text-xs text-muted-foreground">Debug:</span>
			<Button
				variant="outline"
				size="sm"
				class="h-6 text-xs"
				onclick={() => mockAgentStatus('working')}
			>
				Set Working
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="h-6 text-xs"
				onclick={() => mockAgentStatus('done')}
			>
				Set Done
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="h-6 text-xs"
				onclick={() => mockAgentStatus('awaiting_approval')}
			>
				Set Approval
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="h-6 text-xs"
				onclick={() => mockAgentStatus('error')}
			>
				Set Error
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="h-6 text-xs"
				onclick={() => mockAgentStatus('idle')}
			>
				Reset
			</Button>
			<Button variant="outline" size="sm" class="h-6 text-xs" onclick={mockAgentSpec}>
				Set UI Spec
			</Button>
		</div>
	{/if}
</div>

{#if selectedTask && dialogOpen}
	<TodoDetailDialog
		task={selectedTask}
		bind:open={dialogOpen}
		onSave={handleTaskSave}
		onDelete={handleTaskDelete}
		onApprove={handleAgentApprove}
		onReject={handleAgentReject}
		onBlockAction={handleBlockAction}
		onRetry={handleAgentRetry}
	/>
{/if}

<ChatgptConnectDialog
	bind:open={connectDialogOpen}
	description="todo_demo.chatgpt_connect_description"
/>

{#if editingColumnId}
	<ColumnEditDialog
		columnId={editingColumnId}
		columnMeta={columnMetaMap[editingColumnId]}
		defaultTitle={$t(`todo_demo.column.${editingColumnId}`)}
		bind:open={columnEditOpen}
		onSave={async (colId, updates) => {
			try {
				await convexClient.mutation(api.todos.updateColumn, {
					columnId: colId,
					name: updates.name,
					instructions: updates.instructions
				});
			} catch (error) {
				console.error('[kanban] Failed to update column:', error);
				toast.error($t('todo_demo.save_failed'));
			}
		}}
	/>
{/if}
