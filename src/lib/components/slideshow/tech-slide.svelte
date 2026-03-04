<script lang="ts">
	import SlideContainer from './slide-container.svelte';
</script>

<SlideContainer>
	<div class="flex h-full flex-col" style="padding: var(--slide-padding);">
		<h2 class="mb-8 font-serif text-4xl font-bold tracking-tight text-foreground">Architecture</h2>

		<div class="mx-auto flex w-full max-w-[700px] flex-1 flex-col justify-center gap-2.5">
			<!-- Row 1: SvelteKit -->
			<div class="flex items-center gap-4 rounded-2xl border border-border bg-card px-6 py-5">
				<div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
					<span class="text-sm font-bold text-primary">SK</span>
				</div>
				<div>
					<p class="text-base font-semibold text-foreground">SvelteKit</p>
					<p class="text-xs text-muted-foreground">Frontend &amp; SSR</p>
				</div>
			</div>

			<!-- Arrow down -->
			<div class="flex justify-center">
				<svg class="size-5 text-muted-foreground/30" viewBox="0 0 20 20" fill="currentColor">
					<path
						fill-rule="evenodd"
						d="M10 3a.75.75 0 01.75.75v9.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3.75A.75.75 0 0110 3z"
						clip-rule="evenodd"
					/>
				</svg>
			</div>

			<!-- Row 2: Convex -->
			<div class="flex items-center gap-4 rounded-2xl border border-border bg-card px-6 py-5">
				<div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
					<span class="text-sm font-bold text-primary">CX</span>
				</div>
				<div>
					<p class="text-base font-semibold text-foreground">Convex</p>
					<p class="text-xs text-muted-foreground">Real-time backend &amp; Coda orchestration</p>
				</div>
			</div>

			<!-- Arrow down -->
			<div class="flex justify-center">
				<svg class="size-5 text-muted-foreground/30" viewBox="0 0 20 20" fill="currentColor">
					<path
						fill-rule="evenodd"
						d="M10 3a.75.75 0 01.75.75v9.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3.75A.75.75 0 0110 3z"
						clip-rule="evenodd"
					/>
				</svg>
			</div>

			<!-- Row 3: Daytona + AWS + Unipile -->
			<div class="flex gap-3">
				<!-- Daytona + Vibe -->
				<div
					class="flex flex-1 items-center gap-4 rounded-2xl border border-border bg-card px-6 py-5"
				>
					<div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
						<span class="text-sm font-bold text-primary">DT</span>
					</div>
					<div>
						<p class="text-base font-semibold text-foreground">Daytona Sandbox + Mistral Vibe</p>
						<p class="text-xs text-muted-foreground">Isolated code execution using Devstral 2</p>
					</div>
				</div>

				<!-- Right stack -->
				<div class="flex w-[200px] shrink-0 flex-col gap-3">
					<div
						class="flex flex-1 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
					>
						<div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
							<span class="text-xs font-bold text-primary">AWS</span>
						</div>
						<div>
							<p class="text-sm font-semibold text-foreground">Bedrock</p>
							<p class="text-[10px] text-muted-foreground">LLM routing</p>
						</div>
					</div>

					<div
						class="flex flex-1 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
					>
						<div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
							<span class="text-xs font-bold text-primary">UP</span>
						</div>
						<div>
							<p class="text-sm font-semibold text-foreground">Unipile</p>
							<p class="text-[10px] text-muted-foreground">Integrations</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</SlideContainer>
