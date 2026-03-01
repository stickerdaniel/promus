<script lang="ts">
	import SlideContainer from './slide-container.svelte';
</script>

<SlideContainer>
	<div class="flex flex-col justify-between h-full" style="padding: var(--slide-padding);">
		<p class="text-sm text-muted-foreground/70 tracking-widest uppercase">
			Mistral Worldwide Hackathon
		</p>

		<div class="flex flex-col gap-4">
			<h1 class="text-[96px] font-bold tracking-tighter leading-none text-foreground font-serif">
				Promus
			</h1>
			<div class="w-16 h-1 bg-primary rounded-full"></div>
			<p class="text-lg text-muted-foreground font-light">Your tasks, done before you start.</p>
		</div>

		<div class="flex justify-between items-end">
			<p class="text-sm text-muted-foreground/50">Fadi Al Eliwi &middot; Daniel Sticker</p>
			<p class="text-sm text-muted-foreground/50">2026</p>
		</div>
	</div>
</SlideContainer>
