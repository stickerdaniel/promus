<script lang="ts">
	import SlideContainer from './slide-container.svelte';
</script>

<SlideContainer>
	<div class="flex flex-col h-full" style="padding: var(--slide-padding);">
		<h2 class="text-4xl font-bold tracking-tight text-foreground font-serif mb-8">Architecture</h2>

		<div class="flex flex-col gap-2.5 flex-1 justify-center max-w-[700px] mx-auto w-full">
			<!-- Row 1: SvelteKit -->
			<div class="rounded-2xl px-6 py-5 flex items-center gap-4 border border-border bg-card">
				<div class="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
					<span class="text-primary font-bold text-sm">SK</span>
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
			<div class="rounded-2xl px-6 py-5 flex items-center gap-4 border border-border bg-card">
				<div class="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
					<span class="text-primary font-bold text-sm">CX</span>
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
					class="flex-1 rounded-2xl px-6 py-5 flex items-center gap-4 border border-border bg-card"
				>
					<div class="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
						<span class="text-primary font-bold text-sm">DT</span>
					</div>
					<div>
						<p class="text-base font-semibold text-foreground">Daytona Sandbox + Mistral Vibe</p>
						<p class="text-xs text-muted-foreground">Isolated code execution using Devstral 2</p>
					</div>
				</div>

				<!-- Right stack -->
				<div class="flex flex-col gap-3 w-[200px] shrink-0">
					<div
						class="flex-1 rounded-2xl px-4 py-3 flex items-center gap-3 border border-border bg-card"
					>
						<div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
							<span class="text-primary font-bold text-xs">AWS</span>
						</div>
						<div>
							<p class="text-sm font-semibold text-foreground">Bedrock</p>
							<p class="text-[10px] text-muted-foreground">LLM routing</p>
						</div>
					</div>

					<div
						class="flex-1 rounded-2xl px-4 py-3 flex items-center gap-3 border border-border bg-card"
					>
						<div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
							<span class="text-primary font-bold text-xs">UP</span>
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
