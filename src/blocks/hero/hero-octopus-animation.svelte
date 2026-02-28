<script lang="ts">
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';

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

	let shouldAnimate = $state(true);
	let poolIndex = $state(0);
	let phase = $state<'idle' | 'reaching' | 'pulling' | 'collapsing'>('idle');

	let tasks = $derived([
		taskPool[poolIndex % taskPool.length],
		taskPool[(poolIndex + 1) % taskPool.length],
		taskPool[(poolIndex + 2) % taskPool.length],
		taskPool[(poolIndex + 3) % taskPool.length]
	]);

	let enterTask = $derived(taskPool[(poolIndex + 4) % taskPool.length]);

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
		let idx = untrack(() => poolIndex);

		function wait(ms: number) {
			return new Promise<void>((resolve) => {
				timerId = setTimeout(() => {
					if (!cancelled) resolve();
				}, ms);
			});
		}

		async function loop() {
			while (!cancelled) {
				phase = 'reaching';
				await wait(900);
				if (cancelled) break;

				phase = 'pulling';
				await wait(1300);
				if (cancelled) break;

				phase = 'collapsing';
				await wait(1000);
				if (cancelled) break;

				// Data shift + phase reset in one frame — visually seamless
				// because collapsed positions match the new data's default positions
				idx++;
				poolIndex = idx % taskPool.length;
				phase = 'idle';
				await wait(400);
			}
		}

		loop();
		return () => {
			cancelled = true;
			clearTimeout(timerId);
		};
	});
</script>

<svg viewBox="0 0 480 520" class="h-auto w-full max-w-[480px]" aria-hidden="true">
	<!-- Static block: Draft email -->
	<g>
		<rect
			x="80"
			y="80"
			width="200"
			height="56"
			rx="10"
			fill="var(--card)"
			stroke="var(--border)"
			stroke-width="1"
			stroke-opacity="0.8"
		/>
		<text
			x="92"
			y="113"
			font-size="14"
			fill="var(--foreground)"
			style="font-family: var(--font-sans)">Draft email</text
		>
	</g>

	<!-- Slot 2: grabbed by tentacle -->
	<g
		class="octo-grabbed"
		class:octo-pulling={phase === 'pulling'}
		class:octo-hidden={phase === 'collapsing'}
	>
		<rect
			x="80"
			y="152"
			width="200"
			height="56"
			rx="10"
			fill="var(--card)"
			stroke="var(--border)"
			stroke-width="1"
			stroke-opacity="0.8"
		/>
		<text
			x="92"
			y="185"
			font-size="14"
			fill="var(--foreground)"
			style="font-family: var(--font-sans)">{tasks[0]}</text
		>
	</g>

	<!-- Slot 3: collapses up -->
	<g class="octo-slot" class:octo-collapse={phase === 'collapsing'}>
		<rect
			x="80"
			y="224"
			width="200"
			height="56"
			rx="10"
			fill="var(--card)"
			stroke="var(--border)"
			stroke-width="1"
			stroke-opacity="0.8"
		/>
		<text
			x="92"
			y="257"
			font-size="14"
			fill="var(--foreground)"
			style="font-family: var(--font-sans)">{tasks[1]}</text
		>
	</g>

	<!-- Slot 4: collapses up -->
	<g class="octo-slot" class:octo-collapse={phase === 'collapsing'}>
		<rect
			x="80"
			y="296"
			width="200"
			height="56"
			rx="10"
			fill="var(--card)"
			stroke="var(--border)"
			stroke-width="1"
			stroke-opacity="0.8"
		/>
		<text
			x="92"
			y="329"
			font-size="14"
			fill="var(--foreground)"
			style="font-family: var(--font-sans)">{tasks[2]}</text
		>
	</g>

	<!-- Slot 5: collapses up -->
	<g class="octo-slot" class:octo-collapse={phase === 'collapsing'}>
		<rect
			x="80"
			y="368"
			width="200"
			height="56"
			rx="10"
			fill="var(--card)"
			stroke="var(--border)"
			stroke-width="1"
			stroke-opacity="0.8"
		/>
		<text
			x="92"
			y="401"
			font-size="14"
			fill="var(--foreground)"
			style="font-family: var(--font-sans)">{tasks[3]}</text
		>
	</g>

	<!-- Enter slot: new block entering from below -->
	<g class="octo-enter" class:octo-entering={phase === 'collapsing'}>
		<rect
			x="80"
			y="368"
			width="200"
			height="56"
			rx="10"
			fill="var(--card)"
			stroke="var(--border)"
			stroke-width="1"
			stroke-opacity="0.8"
		/>
		<text
			x="92"
			y="401"
			font-size="14"
			fill="var(--foreground)"
			style="font-family: var(--font-sans)">{enterTask}</text
		>
	</g>

	<!-- Tentacle -->
	<g
		class="octo-tentacle"
		class:octo-in={phase === 'reaching'}
		class:octo-out={phase === 'pulling'}
	>
		<g transform="translate(374, 155) scale(-0.35, 0.35) rotate(90) translate(-175.44, -281.4)">
			<path
				d="M174.59,13.72c4.98,5.46,7.62,11.26,9.76,18.33l11.99,8.15c12.03-7.54,25.15-6.47,37.59-.63,18.69,8.77,33.7,32.37,27.62,53.29-.52,1.8-3.79,8.14-3.49,8.99l8.76,11.76c37.85-2.07,65.66,50.33,36.7,77.72-.37.84,2.05,10.92,2.73,11.76s3.94,1.59,5.2,2.3c28.41,15.93,29.75,67.06-1.08,81.43.42,3.72-2.75,14.02-1.33,16.92.18.37,5,4.32,6.01,5.49,17.81,20.7,8.81,58.91-14.74,71.71-1.34.73-6.09,2.39-6.54,2.95-1.16,1.44-1.35,12.44-.95,14.51.27,1.42,6.18,4.83,7.75,6.24,17.51,15.84,21.27,46.91,6.94,65.92-1.12,1.49-2.96,2.07-2.62,4.16.58,3.57,4.23,11.54,5.82,15.21,7.12,16.35,17.47,32.94,28.58,46.87,2.4,3.01,10.13,10.49,11.1,13.39,2.19,6.59-3.06,11.41-9.34,11.88-29.14,2.17-61.56-1.24-90.93-.55l-179.91.05c-10.69-1.4-9-10.13-7.6-18.14,9.39-53.53,30.02-114.82,51.75-164.59,26.46-60.61,62.08-104.62,55.54-175.78C161.84,115.52,77.19,63.61,4.07,32.61-9.38,19.32,14.01,12.94,23.6,9.79,53.91-.16,85.12-2.56,116.54,3.08c3.11.56,7.69,2.53,10.64,2.41,1.91-.08,6.81-3.45,9.73-4.3,13.56-3.97,28.49,2.46,37.69,12.54ZM144.3,17.53c-8.63.75-9.46,7.49-5.98,14.22,2.43,4.7,10.35,10.48,15.55,11.43,10.65,1.95,16.09-4.41,10.62-14.12-3.38-6-13.21-12.14-20.19-11.53ZM231.14,58.11c-12.04-8.51-31.33-9.57-29.77,10.03.77,9.66,8.96,20.03,17.15,24.82,6.87,4.02,20.12,6.23,24.92-1.73,6.57-10.9-3.16-26.67-12.3-33.13ZM268.18,131.46c-12.39,2.52-10.85,20.89-6.87,29.63,4.37,9.61,18.15,23.8,29.63,17.6,18.37-9.92-1.37-51.59-22.75-47.24ZM289.09,222.57c-12.36,10.49-10.88,38.53,3.04,47.1s23.53-10.79,23.69-22.65c.17-12.66-11.56-37.32-26.73-24.45ZM296,362.41c9.71-9.18,13.81-24.54,8.52-37.17-7.22-17.23-23.29-8.52-29.8,4.13-4.89,9.5-6.34,26.28,1.83,34.34,5.38,5.31,11.61,4.5,17.61.62.72-.47,1.23-1.33,1.85-1.91ZM276.68,412.77c-20.01,3.46-16.17,44.2,2.18,51.04,12.4,4.62,19.11-7.8,19.92-18.44.62-8.12-2.1-18.32-7.22-24.74-3.1-3.88-9.71-8.75-14.88-7.86Z"
				fill="var(--primary)"
				opacity="0.8"
			/>
		</g>
	</g>
</svg>

<style>
	/* Tentacle: transition-based for smooth in/out with different speeds */
	.octo-tentacle {
		transform: translateX(300px);
		transition: transform 1.3s ease-in;
	}
	.octo-tentacle.octo-in {
		transform: translateX(0);
		transition: transform 0.9s ease-out;
	}
	.octo-tentacle.octo-out {
		transform: translateX(300px);
		transition: transform 1.3s ease-in;
	}

	/* Grabbed block: pulled offscreen with tentacle */
	.octo-grabbed.octo-pulling {
		animation: octo-grab-pull 1.3s ease-in forwards;
	}
	.octo-grabbed.octo-hidden {
		opacity: 0;
	}

	@keyframes octo-grab-pull {
		from {
			transform: translate(0, 0) rotate(0deg);
			opacity: 1;
		}
		to {
			transform: translate(300px, -20px) rotate(5deg);
			opacity: 0;
		}
	}

	/* Collapsing slots: slide up to fill gap */
	.octo-slot.octo-collapse {
		animation: octo-collapse-up 1s ease-in-out forwards;
	}

	@keyframes octo-collapse-up {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-72px);
		}
	}

	/* Entering block: slides up from below */
	.octo-enter {
		opacity: 0;
		transform: translateY(72px);
	}
	.octo-enter.octo-entering {
		animation: octo-enter-up 1s ease-out forwards;
	}

	@keyframes octo-enter-up {
		from {
			transform: translateY(72px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.octo-tentacle,
		.octo-grabbed,
		.octo-slot,
		.octo-enter {
			animation: none !important;
			transition: none !important;
		}
		.octo-tentacle {
			transform: translateX(300px);
		}
		.octo-enter {
			opacity: 0;
		}
	}
</style>
