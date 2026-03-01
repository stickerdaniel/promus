<script lang="ts">
	import SlideNavigation from '$lib/components/slideshow/slide-navigation.svelte';
	import TitleSlide from '$lib/components/slideshow/title-slide.svelte';
	import ContentSlide from '$lib/components/slideshow/content-slide.svelte';
	import EndSlide from '$lib/components/slideshow/end-slide.svelte';
	import LightSwitch from '$lib/components/ui/light-switch/light-switch.svelte';
</script>

<svelte:head>
	<title>Slideshow | Promus</title>
</svelte:head>

<div class="min-h-screen bg-muted flex flex-col items-center justify-center p-8 gap-6">
	<div class="flex items-center gap-4">
		<h1 class="text-xl font-semibold">Slideshow Preview</h1>
		<LightSwitch />
	</div>
	<SlideNavigation slides={[slide1, slide2, slide3]} />
</div>

{#snippet slide1()}
	<TitleSlide />
{/snippet}

{#snippet slide2()}
	<ContentSlide />
{/snippet}

{#snippet slide3()}
	<EndSlide />
{/snippet}

<style>
	:root {
		--slide-width: 1280px;
		--slide-height: 720px;
		--slide-scale: 0.55;
		--slide-padding: 64px;
	}

	:global(:fullscreen) {
		cursor: none;
	}
	:global(:fullscreen:active) {
		cursor: default;
	}
</style>
