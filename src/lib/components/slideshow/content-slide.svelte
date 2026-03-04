<script lang="ts">
	import SlideContainer from './slide-container.svelte';
</script>

<SlideContainer>
	<div class="flex h-full" style="padding: var(--slide-padding);">
		<!-- Left: statement -->
		<div class="flex flex-1 flex-col justify-center pr-12">
			<h2 class="font-serif text-5xl leading-[1.15] font-bold tracking-tight text-foreground">
				The task takes<br />2 minutes.
			</h2>
			<div class="my-6 h-1 w-12 rounded-full bg-primary"></div>
			<p class="text-lg font-light text-muted-foreground">The prep takes 3 days.</p>
		</div>

		<!-- Right: stale todo visual -->
		<div class="flex w-[380px] shrink-0 flex-col justify-center">
			<div class="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
				<p class="text-xs font-medium tracking-wider text-muted-foreground/60 uppercase">
					Your to-do list
				</p>
				{#each [{ text: 'Follow up with speakers', days: '3 days ago' }, { text: 'Send LinkedIn intros', days: '5 days ago' }, { text: 'Draft partnership email', days: '1 week ago' }] as item (item.text)}
					<div class="flex items-start gap-3">
						<div class="mt-1 size-4 shrink-0 rounded border-2 border-muted-foreground/20"></div>
						<div class="min-w-0 flex-1">
							<p class="text-sm text-foreground/80">{item.text}</p>
							<p class="mt-0.5 text-xs text-muted-foreground/50">{item.days}</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</SlideContainer>
