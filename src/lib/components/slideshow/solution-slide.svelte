<script lang="ts">
	import SlideContainer from './slide-container.svelte';
</script>

<SlideContainer>
	<div class="flex h-full flex-col" style="padding: var(--slide-padding);">
		<div class="mb-8 flex flex-col gap-2">
			<h2 class="font-serif text-4xl font-bold tracking-tight text-foreground">
				Add a task. Get it done.
			</h2>
			<p class="text-lg font-light text-muted-foreground">
				Promus connects to your tools, gathers context, and delivers ready-to-send output.
			</p>
		</div>

		<!-- Integration flow -->
		<div class="flex flex-1 items-center">
			<div class="flex w-full items-center gap-3">
				<!-- Integrations column -->
				<div class="flex w-[200px] shrink-0 flex-col gap-2.5">
					{#each ['LinkedIn', 'Email', 'Calendar', 'Messaging'] as name (name)}
						<div class="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
							<div
								class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"
							>
								<span class="text-xs font-bold text-primary">{name.slice(0, 2).toUpperCase()}</span>
							</div>
							<span class="text-sm font-medium text-foreground">{name}</span>
						</div>
					{/each}
				</div>

				<!-- Arrow -->
				<div class="flex flex-col items-center gap-1 px-2">
					<div class="h-6 w-px bg-border"></div>
					<div
						class="flex size-10 items-center justify-center rounded-full border-2 border-primary bg-primary/10"
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
					<div class="h-6 w-px bg-border"></div>
				</div>

				<!-- Promus agent -->
				<div
					class="flex flex-1 flex-col gap-4 rounded-2xl border-2 border-primary/30 bg-primary/5 p-6"
				>
					<div class="flex items-center gap-3">
						<div class="flex size-10 items-center justify-center rounded-xl bg-primary">
							<span class="text-lg font-bold text-primary-foreground">P</span>
						</div>
						<div>
							<p class="font-semibold text-foreground">Coda</p>
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
					<div class="h-6 w-px bg-border"></div>
					<div
						class="flex size-10 items-center justify-center rounded-full border-2 border-primary bg-primary/10"
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
					<div class="h-6 w-px bg-border"></div>
				</div>

				<!-- You review -->
				<div
					class="flex w-[160px] shrink-0 flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 text-center"
				>
					<div class="flex size-12 items-center justify-center rounded-full bg-primary/10">
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
						<p class="text-sm font-semibold text-foreground">You review</p>
						<p class="mt-0.5 text-xs text-muted-foreground">and send</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</SlideContainer>
