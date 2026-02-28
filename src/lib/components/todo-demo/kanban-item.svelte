<script lang="ts" module>
	import type { TodoItem } from './types.js';

	interface KanbanItemProps {
		task: TodoItem;
		index: number;
		group?: string | number;
		isOverlay?: boolean;
		overlayTilted?: boolean;
		data?: { group: string | number };
	}
</script>

<script lang="ts">
	import { useSortable } from '@dnd-kit-svelte/svelte/sortable';

	let {
		task,
		index,
		group,
		isOverlay = false,
		overlayTilted = true,
		data
	}: KanbanItemProps = $props();

	const { ref, isDragging, isDropping, isDropTarget } = useSortable({
		get id() {
			return task.id;
		},
		index: () => index,
		type: 'item',
		accept: 'item',
		get group() {
			return group;
		},
		get data() {
			return data;
		}
	});
</script>

<div class="relative select-none cursor-grab active:cursor-grabbing" {@attach ref}>
	<div
		class="rounded-lg border border-border/80 bg-card p-3 text-sm text-foreground dark:border-border/60 dark:bg-background {(isDragging.current ||
			isDropping.current) &&
		!isOverlay
			? 'invisible'
			: ''} {isDropTarget.current
			? 'border-primary/35 ring-2 ring-primary/25 bg-primary/[0.04] dark:border-primary/35 dark:ring-primary/25'
			: ''} {isOverlay && overlayTilted ? 'drag-tilt-item' : ''}"
	>
		<span>{task.title}</span>
	</div>

	{#if !isOverlay && (isDragging.current || isDropping.current)}
		<div class="absolute inset-0 rounded-lg bg-primary/[0.02]"></div>
	{/if}
</div>
