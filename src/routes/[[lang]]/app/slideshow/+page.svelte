<script lang="ts">
	import SlideNavigation from '$lib/components/slideshow/slide-navigation.svelte';
	import TitleSlide from '$lib/components/slideshow/title-slide.svelte';
	import ContentSlide from '$lib/components/slideshow/content-slide.svelte';
	import SolutionSlide from '$lib/components/slideshow/solution-slide.svelte';
	import FeedbackSlide from '$lib/components/slideshow/feedback-slide.svelte';
	import TechSlide from '$lib/components/slideshow/tech-slide.svelte';
	import EndSlide from '$lib/components/slideshow/end-slide.svelte';
	import LightSwitch from '$lib/components/ui/light-switch/light-switch.svelte';
</script>

<svelte:head>
	<title>Slideshow | Promus</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted p-8">
	<div class="flex items-center gap-4">
		<h1 class="text-xl font-semibold">Slideshow Preview</h1>
		<LightSwitch />
	</div>
	<SlideNavigation slides={[slide1, slide2, slide3, slide4, slide5, slide6]} />
</div>

{#snippet slide1()}
	<TitleSlide />
{/snippet}

{#snippet slide2()}
	<ContentSlide />
{/snippet}

{#snippet slide3()}
	<SolutionSlide />
{/snippet}

{#snippet slide4()}
	<FeedbackSlide />
{/snippet}

{#snippet slide5()}
	<TechSlide />
{/snippet}

{#snippet slide6()}
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
