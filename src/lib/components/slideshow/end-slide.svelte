<script lang="ts">
	import SlideContainer from './slide-container.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { resolve } from '$app/paths';
</script>

<SlideContainer>
	<div
		class="flex items-center justify-center h-full relative"
		style="padding: var(--slide-padding);"
	>
		<div class="flex flex-col items-center gap-6">
			<div class="w-16 h-1 bg-primary rounded-full"></div>
			<h1 class="text-[112px] font-bold tracking-tighter leading-none text-foreground font-serif">
				DEMO
			</h1>
			<div class="w-16 h-1 bg-primary rounded-full"></div>
			<a href={resolve('/')} class="mt-4">
				<Button variant="outline" size="lg">Start Demo</Button>
			</a>
		</div>
	</div>
</SlideContainer>
