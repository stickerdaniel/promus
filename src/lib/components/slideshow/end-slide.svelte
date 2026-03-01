<script lang="ts">
	import SlideContainer from './slide-container.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import GithubIcon from '@lucide/svelte/icons/github';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
</script>

<SlideContainer>
	<div
		class="flex flex-col items-center justify-center h-full text-center gap-7"
		style="padding: var(--slide-padding);"
	>
		<h2 class="text-foreground text-4xl font-bold">Thank you</h2>
		<Separator class="max-w-48" />
		<p class="text-muted-foreground text-lg">Questions?</p>

		<Card.Root class="max-w-md w-full">
			<Card.Content class="flex flex-col items-center gap-3 pt-4">
				<div class="flex gap-1.5">
					<Badge variant="secondary">SvelteKit</Badge>
					<Badge variant="secondary">Convex</Badge>
					<Badge variant="secondary">Tailwind</Badge>
					<Badge variant="secondary">Playwright</Badge>
				</div>
				<div class="flex gap-2">
					<Button variant="outline" size="sm">
						<GithubIcon class="size-4" /> Source Code
					</Button>
					<Button size="sm">
						View Docs <ExternalLinkIcon class="size-4" />
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	</div>
</SlideContainer>
