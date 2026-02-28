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
	import type { KanbanData, ColumnId } from './types.js';
	import KanbanColumn from './kanban-column.svelte';
	import KanbanItem from './kanban-item.svelte';

	const { t } = getTranslate();
	const convexClient = useConvexClient();

	const sensors = [PointerSensor, KeyboardSensor];
	const columnIds: ColumnId[] = ['todo', 'in-progress', 'done'];
	const boardQuery = useQuery(api.todos.getBoard, {});

	let items: KanbanData = $state({
		todo: [],
		'in-progress': [],
		done: []
	});
	let overlayTilted = $state(false);
	let isDragging = $state(false);
	let pendingSaveCount = $state(0);
	let dragStartSnapshot = $state<KanbanData | null>(null);

	type SyncEvent = {
		operation: { source?: { type?: unknown } | null; target?: unknown | null };
	};

	type EndEvent = SyncEvent & {
		suspend: () => { resume: () => void };
	};

	function cloneBoard(board: KanbanData): KanbanData {
		return {
			todo: board.todo.map((task) => ({ ...task })),
			'in-progress': board['in-progress'].map((task) => ({ ...task })),
			done: board.done.map((task) => ({ ...task }))
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

	function syncItemOrder(event: SyncEvent) {
		const { source, target } = event.operation;
		if (!source || !target || source.type === 'column') return;

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
	}

	async function handleDragEnd(event: EndEvent): Promise<void> {
		syncItemOrder(event);
		overlayTilted = false;
		isDragging = false;

		// Let overlay re-render without tilt before drop animation snapshot is taken.
		const suspended = event.suspend();
		requestAnimationFrame(() => suspended.resume());

		const startBoard = dragStartSnapshot;
		dragStartSnapshot = null;
		if (!startBoard) return;

		const nextBoard = cloneBoard(items);
		if (isSameBoard(startBoard, nextBoard)) return;

		await persistBoard(nextBoard, startBoard);
	}
</script>

<DragDropProvider
	{sensors}
	modifiers={[RestrictToWindowEdges]}
	onDragStart={() => {
		dragStartSnapshot = cloneBoard(items);
		overlayTilted = true;
		isDragging = true;
	}}
	onDragEnd={(event) => {
		void handleDragEnd(event as EndEvent);
	}}
	onDragOver={syncItemOrder}
>
	<div class="grid items-start gap-3 md:grid-cols-3">
		{#each columnIds as columnId, colIdx (columnId)}
			<KanbanColumn
				id={columnId}
				title={$t(`todo_demo.column.${columnId}`)}
				index={colIdx}
				onAdd={(title) => addTodo(columnId, title)}
			>
				{#each items[columnId] as task, taskIdx (task.id)}
					<KanbanItem {task} index={taskIdx} group={columnId} data={{ group: columnId }} />
				{/each}
			</KanbanColumn>
		{/each}
	</div>

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
					title={$t(`todo_demo.column.${colId}`)}
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
