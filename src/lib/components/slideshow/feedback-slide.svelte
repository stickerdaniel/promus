<script lang="ts">
	import SlideContainer from './slide-container.svelte';
</script>

<SlideContainer>
	<div class="flex h-full" style="padding: var(--slide-padding);">
		<!-- Left -->
		<div class="flex flex-1 flex-col justify-center pr-16">
			<h2 class="font-serif text-5xl leading-[1.1] font-bold tracking-tight text-foreground">
				Your standards<br />become its<br />standards.
			</h2>
			<div class="my-8 h-1 w-12 rounded-full bg-primary"></div>
			<p class="max-w-[360px] text-lg font-light text-muted-foreground">
				Give feedback. Coda learns your tone, your preferences, your way of working.
			</p>
		</div>

		<!-- Right: feedback loop visual -->
		<div class="flex w-[400px] shrink-0 items-center justify-center">
			<div class="relative">
				<!-- Circle loop -->
				<svg class="size-[280px]" viewBox="0 0 280 280" fill="none">
					<circle
						cx="140"
						cy="140"
						r="110"
						stroke="currentColor"
						class="text-border"
						stroke-width="2"
						stroke-dasharray="8 6"
					/>
					<path
						d="M 250 140 A 110 110 0 0 1 30 140"
						stroke="currentColor"
						class="text-primary/30"
						stroke-width="3"
						stroke-linecap="round"
					/>
				</svg>

				<!-- Top: Agent output -->
				<div class="absolute -top-2 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
					<div class="flex size-14 items-center justify-center rounded-2xl bg-primary shadow-sm">
						<span class="text-xl font-bold text-primary-foreground">P</span>
					</div>
					<span class="text-xs font-medium whitespace-nowrap text-foreground">Coda output</span>
				</div>

				<!-- Right: Review -->
				<div class="absolute top-1/2 -right-4 flex -translate-y-1/2 flex-col items-center gap-2">
					<div
						class="flex size-14 items-center justify-center rounded-2xl border-2 border-border bg-card"
					>
						<svg
							class="size-5 text-foreground"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					</div>
					<span class="text-xs font-medium text-foreground">Review</span>
				</div>

				<!-- Bottom: Correct -->
				<div class="absolute -bottom-2 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
					<div
						class="flex size-14 items-center justify-center rounded-2xl border-2 border-border bg-card"
					>
						<svg
							class="size-5 text-muted-foreground"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
						</svg>
					</div>
					<span class="text-xs font-medium text-foreground">Correct</span>
				</div>

				<!-- Left: Adapts -->
				<div class="absolute top-1/2 -left-4 flex -translate-y-1/2 flex-col items-center gap-2">
					<div
						class="flex size-14 items-center justify-center rounded-2xl border-2 border-primary/30 bg-primary/10"
					>
						<svg
							class="size-5 text-primary"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
						</svg>
					</div>
					<span class="text-xs font-medium text-primary">Adapts</span>
				</div>
			</div>
		</div>
	</div>
</SlideContainer>
