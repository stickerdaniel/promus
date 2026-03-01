<script lang="ts" module>
	import type { TodoItem } from './types.js';

	interface KanbanItemProps {
		task: TodoItem;
		index: number;
		group?: string | number;
		isOverlay?: boolean;
		overlayTilted?: boolean;
		data?: { group: string | number };
		onclick?: (task: TodoItem) => void;
	}
</script>

<script lang="ts">
	import { useSortable } from '@dnd-kit-svelte/svelte/sortable';
	import StickyNoteIcon from '@lucide/svelte/icons/sticky-note';
	import Logo from '$lib/components/icons/logo.svelte';

	let {
		task,
		index,
		group,
		isOverlay = false,
		overlayTilted = true,
		data,
		onclick
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

	let pointerStart: { x: number; y: number } | null = null;

	function handlePointerDown(e: PointerEvent) {
		pointerStart = { x: e.clientX, y: e.clientY };
	}

	function handlePointerUp(e: PointerEvent) {
		if (!pointerStart || !onclick) return;
		const dx = Math.abs(e.clientX - pointerStart.x);
		const dy = Math.abs(e.clientY - pointerStart.y);
		// Only treat as click if pointer barely moved (not a drag)
		if (dx < 5 && dy < 5) {
			onclick(task);
		}
		pointerStart = null;
	}
</script>

<div class="relative select-none cursor-grab active:cursor-grabbing" {@attach ref}>
	<div
		class="rounded-lg border border-border/80 bg-card p-3 text-sm text-foreground transition-colors hover:border-primary/40 dark:border-border/60 dark:bg-background {(isDragging.current ||
			isDropping.current) &&
		!isOverlay
			? 'invisible'
			: ''} {isDropTarget.current
			? 'border-primary/35 ring-2 ring-primary/25 bg-primary/[0.04] dark:border-primary/35 dark:ring-primary/25'
			: ''} {isOverlay && overlayTilted ? 'drag-tilt-item' : ''}"
		onpointerdown={handlePointerDown}
		onpointerup={handlePointerUp}
	>
		<div class="flex items-center justify-between gap-2">
			<span class="min-w-0">{task.title}</span>
			{#if task.agentStatus === 'working' || task.agentStatus === 'done' || task.agentStatus === 'awaiting_approval'}
				<Logo
					class="size-4 shrink-0 text-muted-foreground {task.agentStatus === 'working'
						? 'agent-working'
						: 'agent-done'}"
				/>
			{:else if task.notes}
				<StickyNoteIcon class="size-4 shrink-0 text-muted-foreground" />
			{/if}
		</div>
	</div>

	{#if !isOverlay && (isDragging.current || isDropping.current)}
		<div class="absolute inset-0 rounded-lg bg-primary/[0.02]"></div>
	{/if}
</div>
