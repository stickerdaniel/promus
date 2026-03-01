<script lang="ts">
	import SlideContainer from './slide-container.svelte';
</script>

<SlideContainer>
	<div class="flex h-full" style="padding: var(--slide-padding);">
		<!-- Left: statement -->
		<div class="flex flex-col justify-center flex-1 pr-12">
			<h2 class="text-5xl font-bold leading-[1.15] tracking-tight text-foreground font-serif">
				The task takes<br />2 minutes.
			</h2>
			<div class="w-12 h-1 bg-primary rounded-full my-6"></div>
			<p class="text-lg font-light text-muted-foreground">The prep takes 3 days.</p>
		</div>

		<!-- Right: stale todo visual -->
		<div class="flex flex-col justify-center w-[380px] shrink-0">
			<div class="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm">
				<p class="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
					Your to-do list
				</p>
				{#each [{ text: 'Follow up with speakers', days: '3 days ago' }, { text: 'Send LinkedIn intros', days: '5 days ago' }, { text: 'Draft partnership email', days: '1 week ago' }] as item (item.text)}
					<div class="flex items-start gap-3">
						<div class="mt-1 size-4 rounded border-2 shrink-0 border-muted-foreground/20"></div>
						<div class="flex-1 min-w-0">
							<p class="text-sm text-foreground/80">{item.text}</p>
							<p class="text-xs text-muted-foreground/50 mt-0.5">{item.days}</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</SlideContainer>
