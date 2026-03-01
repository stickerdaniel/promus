<script lang="ts">
	import SlideContainer from './slide-container.svelte';
</script>

<SlideContainer>
	<div class="flex flex-col h-full" style="padding: var(--slide-padding);">
		<div class="flex flex-col gap-2 mb-8">
			<h2 class="text-4xl font-bold tracking-tight text-foreground font-serif">
				Add a task. Get it done.
			</h2>
			<p class="text-lg text-muted-foreground font-light">
				Promus connects to your tools, gathers context, and delivers ready-to-send output.
			</p>
		</div>

		<!-- Integration flow -->
		<div class="flex-1 flex items-center">
			<div class="flex items-center w-full gap-3">
				<!-- Integrations column -->
				<div class="flex flex-col gap-2.5 w-[200px] shrink-0">
					{#each ['LinkedIn', 'Email', 'Calendar', 'Messaging'] as name (name)}
						<div class="flex items-center gap-3 rounded-xl px-4 py-3 border border-border bg-card">
							<div
								class="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"
							>
								<span class="text-primary font-bold text-xs">{name.slice(0, 2).toUpperCase()}</span>
							</div>
							<span class="text-sm font-medium text-foreground">{name}</span>
						</div>
					{/each}
				</div>

				<!-- Arrow -->
				<div class="flex flex-col items-center gap-1 px-2">
					<div class="w-px h-6 bg-border"></div>
					<div
						class="size-10 rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center"
					>
						<svg
							class="size-4 text-primary"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
						>
							<path d="M5 12h14M12 5l7 7-7 7" />
						</svg>
					</div>
					<div class="w-px h-6 bg-border"></div>
				</div>

				<!-- Promus agent -->
				<div
					class="flex-1 rounded-2xl border-2 border-primary/30 bg-primary/5 p-6 flex flex-col gap-4"
				>
					<div class="flex items-center gap-3">
						<div class="size-10 rounded-xl bg-primary flex items-center justify-center">
							<span class="text-primary-foreground font-bold text-lg">P</span>
						</div>
						<div>
							<p class="font-semibold text-foreground">Promus Agent</p>
							<p class="text-xs text-muted-foreground">Powered by Devstral</p>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-2">
						{#each ['Plans the work', 'Researches context', 'Drafts messages', 'Ready to send'] as step, i (step)}
							<div class="flex items-center gap-2 text-sm">
								<span class="text-xs font-bold text-primary/60"
									>{String(i + 1).padStart(2, '0')}</span
								>
								<span class="text-foreground/80">{step}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- Arrow -->
				<div class="flex flex-col items-center gap-1 px-2">
					<div class="w-px h-6 bg-border"></div>
					<div
						class="size-10 rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center"
					>
						<svg
							class="size-4 text-primary"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
						>
							<path d="M5 12h14M12 5l7 7-7 7" />
						</svg>
					</div>
					<div class="w-px h-6 bg-border"></div>
				</div>

				<!-- You review -->
				<div
					class="w-[160px] shrink-0 rounded-2xl border border-border bg-card p-5 flex flex-col items-center text-center gap-3"
				>
					<div class="size-12 rounded-full bg-primary/10 flex items-center justify-center">
						<svg
							class="size-5 text-primary"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M20 6L9 17l-5-5" />
						</svg>
					</div>
					<div>
						<p class="font-semibold text-foreground text-sm">You review</p>
						<p class="text-xs text-muted-foreground mt-0.5">and send</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</SlideContainer>
