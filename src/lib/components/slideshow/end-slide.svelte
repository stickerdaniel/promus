<script lang="ts">
	import SlideContainer from './slide-container.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { resolve } from '$app/paths';
</script>

<SlideContainer>
	<div
		class="relative flex h-full items-center justify-center"
		style="padding: var(--slide-padding);"
	>
		<div class="flex flex-col items-center gap-6">
			<div class="h-1 w-16 rounded-full bg-primary"></div>
			<h1 class="font-serif text-[112px] leading-none font-bold tracking-tighter text-foreground">
				DEMO
			</h1>
			<div class="h-1 w-16 rounded-full bg-primary"></div>
			<a href={resolve('/')} class="mt-4">
				<Button variant="outline" size="lg">Start Demo</Button>
			</a>
		</div>
	</div>
</SlideContainer>
