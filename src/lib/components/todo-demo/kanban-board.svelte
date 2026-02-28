<script lang="ts">
	import {
		DragDropProvider,
		DragOverlay,
		KeyboardSensor,
		PointerSensor
	} from '@dnd-kit-svelte/svelte';
	import { RestrictToWindowEdges } from '@dnd-kit-svelte/svelte/modifiers';
	import { move } from '@dnd-kit/helpers';
	import { getTranslate } from '@tolgee/svelte';
	import type { KanbanData, ColumnId } from './types.js';
	import KanbanColumn from './kanban-column.svelte';
	import KanbanItem from './kanban-item.svelte';

	const { t } = getTranslate();

	const sensors = [PointerSensor, KeyboardSensor];

	const columnIds: ColumnId[] = ['todo', 'in-progress', 'done'];

	let items: KanbanData = $state({
		todo: [
			{ id: 'task-1', title: $t('todo_demo.sample.task_1') },
			{ id: 'task-2', title: $t('todo_demo.sample.task_2') }
		],
		'in-progress': [
			{ id: 'task-3', title: $t('todo_demo.sample.task_3') },
			{ id: 'task-4', title: $t('todo_demo.sample.task_4') }
		],
		done: [
			{ id: 'task-5', title: $t('todo_demo.sample.task_5') },
			{ id: 'task-6', title: $t('todo_demo.sample.task_6') }
		]
	});

	let nextId = 7;
	let overlayTilted = $state(false);

	function syncItemOrder(event: {
		operation: { source?: { type?: unknown } | null; target?: unknown | null };
	}) {
		const { source, target } = event.operation;
		if (!source || !target || source.type === 'column') return;

		items = move(items, event as any);
	}

	function addTodo(columnId: ColumnId, title: string) {
		items[columnId] = [
			...items[columnId],
			{
				id: `task-${nextId++}`,
				title
			}
		];
	}
</script>

<DragDropProvider
	{sensors}
	modifiers={[RestrictToWindowEdges]}
	onDragStart={() => {
		overlayTilted = true;
	}}
	onDragEnd={(event) => {
		syncItemOrder(event);
		overlayTilted = false;

		// Let overlay re-render without tilt before drop animation snapshot is taken.
		const suspended = event.suspend();
		requestAnimationFrame(() => suspended.resume());
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
