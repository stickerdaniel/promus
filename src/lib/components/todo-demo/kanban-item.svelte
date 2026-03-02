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
	import { fade } from 'svelte/transition';
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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onclick?.(task);
		}
	}
</script>

<div
	class="relative select-none cursor-grab active:cursor-grabbing {isOverlay && overlayTilted
		? 'drag-tilt-item'
		: ''}"
	{@attach ref}
>
	<!-- Agent working gradient (fade in/out) -->
	{#if task.agentStatus === 'working'}
		<div
			class="agent-gradient-glow pointer-events-none rounded-lg {!isOverlay &&
			(isDragging.current || isDropping.current)
				? 'invisible'
				: ''}"
			transition:fade={{ duration: 600 }}
		></div>
		<div
			class="agent-gradient pointer-events-none rounded-lg {!isOverlay &&
			(isDragging.current || isDropping.current)
				? 'invisible'
				: ''}"
			transition:fade={{ duration: 600 }}
		></div>
	{/if}
	<div
		class="relative z-[1] rounded-lg border border-border/80 bg-card p-3 text-sm text-foreground transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none dark:border-border/60 dark:bg-background {(isDragging.current ||
			isDropping.current) &&
		!isOverlay
			? 'invisible'
			: ''} {isDropTarget.current
			? 'border-primary/35 ring-2 ring-primary/25 bg-primary/[0.04] dark:border-primary/35 dark:ring-primary/25'
			: ''}"
		role="button"
		tabindex={isOverlay ? -1 : 0}
		data-task-id={task.id}
		data-task-group={group}
		onpointerdown={handlePointerDown}
		onpointerup={handlePointerUp}
		onkeydown={handleKeydown}
	>
		<div class="flex items-center justify-between gap-2">
			<span class="min-w-0">{task.title}</span>
			{#if task.agentStatus === 'working'}
				<Logo class="size-4 shrink-0 text-muted-foreground agent-working" />
			{:else if task.notes}
				<span class="relative shrink-0">
					<StickyNoteIcon class="size-4 text-muted-foreground" />
					{#if task.hasUnreadNotes}
						<span class="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-blue-500"></span>
					{/if}
				</span>
			{/if}
		</div>
	</div>

	{#if !isOverlay && (isDragging.current || isDropping.current)}
		<div class="absolute inset-0 rounded-lg bg-primary/[0.02]"></div>
	{/if}
</div>

<style>
	/* --- Agent working gradient --- */
	.agent-gradient,
	.agent-gradient-glow {
		position: absolute;
		inset: -2px;
		overflow: hidden;
	}
	.agent-gradient-glow {
		filter: blur(12px);
	}
	.agent-gradient::before,
	.agent-gradient-glow::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: 99999px;
		height: 99999px;
		background-repeat: no-repeat;
		background-position: 0 0;
		opacity: 0.4;
		background-image: conic-gradient(
			transparent,
			rgb(182, 224, 220),
			rgb(234, 239, 140),
			rgb(253, 193, 158),
			rgb(242, 155, 229),
			rgb(196, 174, 255),
			transparent 95%
		);
		filter: blur(20px);
		transform: translate(-50%, -50%) rotate(0deg);
		animation: agent-border-spin 4s linear infinite;
		pointer-events: none;
	}

	@keyframes agent-border-spin {
		0% {
			transform: translate(-50%, -50%) rotate(0deg);
		}
		100% {
			transform: translate(-50%, -50%) rotate(-360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.agent-gradient::before,
		.agent-gradient-glow::before {
			animation: none !important;
		}
	}
</style>
