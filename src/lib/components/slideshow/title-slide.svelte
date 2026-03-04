<script lang="ts">
	import SlideContainer from './slide-container.svelte';
</script>

<SlideContainer>
	<div class="flex h-full flex-col justify-between" style="padding: var(--slide-padding);">
		<p class="text-sm tracking-widest text-muted-foreground/70 uppercase">
			Mistral Worldwide Hackathon
		</p>

		<div class="flex flex-col gap-4">
			<h1 class="font-serif text-[96px] leading-none font-bold tracking-tighter text-foreground">
				Promus
			</h1>
			<div class="h-1 w-16 rounded-full bg-primary"></div>
			<p class="text-lg font-light text-muted-foreground">Your tasks, done before you start.</p>
		</div>

		<div class="flex items-end justify-between">
			<p class="text-sm text-muted-foreground/50">Fadi Al Eliwi &middot; Daniel Sticker</p>
			<p class="text-sm text-muted-foreground/50">2026</p>
		</div>
	</div>
</SlideContainer>
