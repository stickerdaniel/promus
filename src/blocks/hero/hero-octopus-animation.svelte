<script lang="ts">
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import {
		DragDropProvider,
		DragOverlay,
		PointerSensor,
		KeyboardSensor
	} from '@dnd-kit-svelte/svelte';
	import { RestrictToWindowEdges } from '@dnd-kit-svelte/svelte/modifiers';
	import { move } from '@dnd-kit/helpers';
	import KanbanItem from '$lib/components/todo-demo/kanban-item.svelte';
	import TodoAddForm from '$lib/components/todo-demo/todo-add-form.svelte';
	import type { TodoItem } from '$lib/components/todo-demo/types.js';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';

	const taskPool = [
		'Schedule meeting',
		'Research report',
		'Update CRM',
		'Follow up',
		'Review docs',
		'Send invoice',
		'Plan sprint',
		'Write proposal',
		'Check analytics',
		'Team standup',
		'Code review',
		'Deploy update'
	];

	function makeTask(title: string): TodoItem {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return { id: crypto.randomUUID(), title };
		}
		return { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title };
	}

	const MAX_TASKS = 5;

	// Single demo column — key matches the `group` prop passed to KanbanItem
	let board = $state<{ demo: TodoItem[] }>({
		demo: taskPool.slice(0, MAX_TASKS).map(makeTask)
	});
	let nextPoolIdx = $state(MAX_TASKS);

	let phase = $state<'idle' | 'reaching' | 'pulling'>('idle');
	let grabbedId = $state<string | null>(null);
	let grabbedOffset = $state(0); // px — drives CSS transform on grabbed card
	let shouldAnimate = $state(true);
	let isDragging = $state(false);
	let overlayTilted = $state(false);

	$effect(() => {
		if (!browser) return;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		shouldAnimate = !mq.matches;
		const onChange = (e: MediaQueryListEvent) => (shouldAnimate = !e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	$effect(() => {
		if (!browser || !shouldAnimate) return;

		let cancelled = false;
		let timerId: ReturnType<typeof setTimeout>;

		function wait(ms: number) {
			return new Promise<void>((resolve) => {
				timerId = setTimeout(() => {
					if (!cancelled) resolve();
				}, ms);
			});
		}

		async function loop() {
			// Small initial delay so the hero isn't mid-animation on first paint
			await wait(1200);

			while (!cancelled) {
				// Don't interrupt while the user is manually dragging
				if (isDragging) {
					await wait(400);
					continue;
				}

				if (!board.demo.length) {
					await wait(1000);
					continue;
				}

				// Squid reaches in — tentacle slides in, no glow yet.
				phase = 'reaching';
				const targetId = board.demo[0].id;
				grabbedId = targetId;
				await wait(1200); // tentacle arrives at card
				if (cancelled) break;
				if (phase !== 'reaching') continue;

				// Tentacle touches card → activate glow AND start pull simultaneously.
				// grabbedOffset=300 drives a CSS translateX on the card wrapper (1.8s ease-in-out),
				// exactly matching the octo-out tentacle retraction (also 1.8s ease-in-out).
				board.demo = board.demo.map((t, i) =>
					i === 0 ? { ...t, agentStatus: 'working' as const } : t
				);
				phase = 'pulling';
				grabbedOffset = 300;

				await wait(1800); // both card CSS-transition and tentacle retraction finish
				if (cancelled) break;

				// Card is now off-screen → safe to splice (no visible jump).
				// Add new task at end (triggers in:scale pop-in).
				const idx = untrack(() => nextPoolIdx);
				nextPoolIdx = idx + 1;
				board.demo = [...board.demo.slice(1), makeTask(taskPool[idx % taskPool.length])];
				grabbedOffset = 0;

				await wait(500); // let new card pop in before resetting
				if (cancelled) break;

				phase = 'idle';
				grabbedId = null;
				await wait(1000);
			}
		}

		loop();
		return () => {
			cancelled = true;
			clearTimeout(timerId);
		};
	});

	// If the user manually starts dragging while the AI animation is mid-flight,
	// reset the AI state so only the user's drag takes effect.
	$effect(() => {
		if (isDragging && grabbedId && phase === 'reaching') {
			const id = grabbedId;
			untrack(() => {
				board.demo = board.demo.map((t) => (t.id === id ? { ...t, agentStatus: undefined } : t));
				grabbedId = null;
				grabbedOffset = 0;
				phase = 'idle';
			});
		}
	});

	const sensors = [PointerSensor, KeyboardSensor];

	type EndEvent = { suspend: () => { resume: () => void } };
</script>

<!--
  The 480×520 container keeps the same coordinate space as the original SVG
  so the tentacle overlay aligns with the task list in the column.
-->
<div class="hero-octo-wrapper" aria-hidden="true">
	<div class="relative h-[520px] w-[480px] origin-top-left overflow-hidden" style="">
		<!-- Real KanbanColumn shell + KanbanItem cards with DnD -->
		<div class="absolute" style="left: 64px; top: 80px; width: 280px;">
			<DragDropProvider
				{sensors}
				modifiers={[RestrictToWindowEdges]}
				onDragStart={() => {
					isDragging = true;
					overlayTilted = true;
				}}
				onDragOver={(event) => {
					board = move(board, event as any) as { demo: TodoItem[] };
				}}
				onDragEnd={(event) => {
					board = move(board, event as any) as { demo: TodoItem[] };
					isDragging = false;
					overlayTilted = false;
					// Let overlay re-render without tilt before drop animation snapshot
					const suspended = (event as EndEvent).suspend();
					requestAnimationFrame(() => suspended.resume());
				}}
			>
				<!-- Column shell — same markup/classes as kanban-column.svelte -->
				<div
					class="rounded-xl border border-border/80 bg-muted/45 p-3 dark:border-border/60 dark:bg-card/95"
				>
					<div class="flex items-center justify-between px-1 pb-3">
						<span class="text-sm font-semibold text-foreground">To do</span>
						<div class="flex items-center gap-0.5">
							<button
								class="rounded p-1 text-foreground/70 transition-colors hover:bg-muted/70 hover:text-foreground dark:hover:bg-background"
								tabindex="-1"
							>
								<PencilIcon class="size-3.5" />
							</button>
							<button
								class="cursor-default rounded p-1 text-foreground/70 transition-colors hover:bg-muted/70 hover:text-foreground dark:hover:bg-background"
								tabindex="-1"
							>
								<GripVerticalIcon class="size-4" />
							</button>
						</div>
					</div>

					<!-- Task list — real KanbanItem components -->
					<div class="grid min-h-0 gap-2">
						{#each board.demo as task, i (task.id)}
							<div
								animate:flip={{ duration: 300 }}
								in:scale={{ start: 0.85, duration: 450, easing: backOut }}
								style={task.id === grabbedId
									? `transform: translateX(${grabbedOffset}px); rotate: ${grabbedOffset > 0 ? '2deg' : '0deg'}; opacity: ${grabbedOffset > 0 ? 0 : 1}; transition: transform 1.8s ease-in-out, rotate 75ms ease-out, opacity 1.2s ease-in-out 0.4s;${grabbedOffset > 0 ? ' pointer-events: none;' : ''}`
									: ''}
							>
								<KanbanItem {task} index={i} group="demo" data={{ group: 'demo' }} />
							</div>
						{/each}
					</div>

					<TodoAddForm
						onAdd={(title) => {
							const newTask = makeTask(title);
							if (board.demo.length < MAX_TASKS) {
								board.demo = [...board.demo, newTask];
							} else {
								// List is full — drop the oldest task that isn't currently grabbed,
								// then append the new one. The list stays the same height.
								const dropIdx = board.demo.findIndex((t) => t.id !== grabbedId);
								if (dropIdx === -1) return; // all grabbed (shouldn't happen)
								const next = [...board.demo];
								next.splice(dropIdx, 1);
								board.demo = [...next, newTask];
							}
						}}
					/>
				</div>

				<!-- DragOverlay — same as in kanban-board.svelte -->
				<DragOverlay>
					{#snippet children(source)}
						{@const task = board.demo.find((t) => t.id === source.id)}
						{#if task}
							<KanbanItem {task} index={0} group="demo" isOverlay {overlayTilted} />
						{/if}
					{/snippet}
				</DragOverlay>
			</DragDropProvider>
		</div>

		<!-- Squid tentacle SVG — full-container overlay, same viewBox + transform as always -->
		<svg
			class="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
			viewBox="0 0 480 520"
		>
			<g
				class="octo-tentacle"
				class:octo-in={phase === 'reaching'}
				class:octo-out={phase === 'pulling'}
			>
				<g transform="translate(422, 155) scale(-0.35, 0.35) rotate(90) translate(-175.44, -281.4)">
					<path
						d="M174.59,13.72c4.98,5.46,7.62,11.26,9.76,18.33l11.99,8.15c12.03-7.54,25.15-6.47,37.59-.63,18.69,8.77,33.7,32.37,27.62,53.29-.52,1.8-3.79,8.14-3.49,8.99l8.76,11.76c37.85-2.07,65.66,50.33,36.7,77.72-.37.84,2.05,10.92,2.73,11.76s3.94,1.59,5.2,2.3c28.41,15.93,29.75,67.06-1.08,81.43.42,3.72-2.75,14.02-1.33,16.92.18.37,5,4.32,6.01,5.49,17.81,20.7,8.81,58.91-14.74,71.71-1.34.73-6.09,2.39-6.54,2.95-1.16,1.44-1.35,12.44-.95,14.51.27,1.42,6.18,4.83,7.75,6.24,17.51,15.84,21.27,46.91,6.94,65.92-1.12,1.49-2.96,2.07-2.62,4.16.58,3.57,4.23,11.54,5.82,15.21,7.12,16.35,17.47,32.94,28.58,46.87,2.4,3.01,10.13,10.49,11.1,13.39,2.19,6.59-3.06,11.41-9.34,11.88-29.14,2.17-61.56-1.24-90.93-.55l-179.91.05c-10.69-1.4-9-10.13-7.6-18.14,9.39-53.53,30.02-114.82,51.75-164.59,26.46-60.61,62.08-104.62,55.54-175.78C161.84,115.52,77.19,63.61,4.07,32.61-9.38,19.32,14.01,12.94,23.6,9.79,53.91-.16,85.12-2.56,116.54,3.08c3.11.56,7.69,2.53,10.64,2.41,1.91-.08,6.81-3.45,9.73-4.3,13.56-3.97,28.49,2.46,37.69,12.54ZM144.3,17.53c-8.63.75-9.46,7.49-5.98,14.22,2.43,4.7,10.35,10.48,15.55,11.43,10.65,1.95,16.09-4.41,10.62-14.12-3.38-6-13.21-12.14-20.19-11.53ZM231.14,58.11c-12.04-8.51-31.33-9.57-29.77,10.03.77,9.66,8.96,20.03,17.15,24.82,6.87,4.02,20.12,6.23,24.92-1.73,6.57-10.9-3.16-26.67-12.3-33.13ZM268.18,131.46c-12.39,2.52-10.85,20.89-6.87,29.63,4.37,9.61,18.15,23.8,29.63,17.6,18.37-9.92-1.37-51.59-22.75-47.24ZM289.09,222.57c-12.36,10.49-10.88,38.53,3.04,47.1s23.53-10.79,23.69-22.65c.17-12.66-11.56-37.32-26.73-24.45ZM296,362.41c9.71-9.18,13.81-24.54,8.52-37.17-7.22-17.23-23.29-8.52-29.8,4.13-4.89,9.5-6.34,26.28,1.83,34.34,5.38,5.31,11.61,4.5,17.61.62.72-.47,1.23-1.33,1.85-1.91ZM276.68,412.77c-20.01,3.46-16.17,44.2,2.18,51.04,12.4,4.62,19.11-7.8,19.92-18.44.62-8.12-2.1-18.32-7.22-24.74-3.1-3.88-9.71-8.75-14.88-7.86Z"
						fill="var(--primary)"
						opacity="0.8"
					/>
				</g>
			</g>
		</svg>

		<!-- Soft fade on the right edge so the tentacle doesn't clip hard -->
		<div
			class="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-linear-to-l from-background"
		></div>
	</div>
</div>

<style>
	/* Scale the fixed 480×520 layout to fit the container width */
	.hero-octo-wrapper {
		width: 100%;
		max-width: 480px;
		aspect-ratio: 480 / 520;
		position: relative;
	}
	.hero-octo-wrapper > div {
		scale: calc(100cqi / 480);
		transform-origin: top left;
	}
	@container (min-width: 480px) {
		.hero-octo-wrapper > div {
			scale: 1;
		}
	}
	.hero-octo-wrapper {
		container-type: inline-size;
	}

	/* Tentacle slide in/out */
	.octo-tentacle {
		transform: translateX(300px);
		transition: transform 1.8s ease-in-out;
	}
	.octo-tentacle.octo-in {
		transform: translateX(0);
		transition: transform 1.2s ease-out;
	}
	.octo-tentacle.octo-out {
		transform: translateX(300px);
		transition: transform 1.8s ease-in-out;
	}

	@media (prefers-reduced-motion: reduce) {
		.octo-tentacle {
			animation: none !important;
			transition: none !important;
			transform: translateX(300px);
		}
	}
</style>
