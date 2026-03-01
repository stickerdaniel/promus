<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';

	let { slides }: { slides: Snippet[] } = $props();

	let current = $state(0);
	let fullscreen = $state(false);
	let fsScale = $state(1);
	let containerEl: HTMLDivElement | null = $state(null);

	const total = $derived(slides.length);

	function prev() {
		current = Math.max(0, current - 1);
	}
	function next() {
		current = Math.min(total - 1, current + 1);
	}

	function toggleFullscreen() {
		if (!containerEl) return;
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			containerEl.requestFullscreen();
		}
	}

	function onFullscreenChange() {
		const isFs = !!document.fullscreenElement;
		fullscreen = isFs;
		if (isFs) {
			const scaleX = window.innerWidth / 1280;
			const scaleY = window.innerHeight / 720;
			fsScale = Math.min(scaleX, scaleY);
		}
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			prev();
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
			e.preventDefault();
			next();
		} else if (e.key === 'Escape' && document.fullscreenElement) {
			document.exitFullscreen();
		} else if (e.key === 'f' || e.key === 'F') {
			toggleFullscreen();
		}
	}
</script>

<svelte:window onkeydown={onKeyDown} />
<svelte:document onfullscreenchange={onFullscreenChange} />

<div
	bind:this={containerEl}
	class="flex flex-col items-center"
	class:bg-black={fullscreen}
	class:justify-center={fullscreen}
	class:h-full={fullscreen}
	style:gap={fullscreen ? '0' : '16px'}
>
	<div
		class:flex={fullscreen}
		class:items-center={fullscreen}
		class:justify-center={fullscreen}
		class:w-full={fullscreen}
		class:h-full={fullscreen}
		style:transform={fullscreen ? undefined : 'scale(var(--slide-scale))'}
		style:transform-origin="top center"
	>
		<div
			style:transform={fullscreen ? `scale(${fsScale})` : undefined}
			style:transform-origin="center"
		>
			{@render slides[current]()}
		</div>
	</div>

	{#if !fullscreen}
		<div class="flex items-center gap-3">
			<Button variant="outline" size="icon" onclick={prev} disabled={current === 0}>
				<ChevronLeftIcon class="size-4" />
			</Button>
			<span class="text-sm text-muted-foreground tabular-nums">
				{current + 1} / {total}
			</span>
			<Button variant="outline" size="icon" onclick={next} disabled={current === total - 1}>
				<ChevronRightIcon class="size-4" />
			</Button>
			<Button variant="outline" size="icon" onclick={toggleFullscreen}>
				<MaximizeIcon class="size-4" />
			</Button>
		</div>
	{/if}
</div>
