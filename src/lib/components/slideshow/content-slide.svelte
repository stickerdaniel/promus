<script lang="ts">
	import SlideContainer from './slide-container.svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CodeIcon from '@lucide/svelte/icons/code';
	import PaletteIcon from '@lucide/svelte/icons/palette';
	import ZapIcon from '@lucide/svelte/icons/zap';
	import GlobeIcon from '@lucide/svelte/icons/globe';
</script>

<SlideContainer>
	<div class="flex flex-col h-full gap-7" style="padding: var(--slide-padding);">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<h2 class="text-foreground text-3xl font-bold">Key Features</h2>
				<Badge variant="outline" class="text-xs">Slide 2 of 3</Badge>
			</div>
			<div class="flex gap-1.5">
				<Badge>SvelteKit</Badge>
				<Badge variant="secondary">Tailwind 4</Badge>
				<Badge variant="secondary">Playwright</Badge>
			</div>
		</div>

		<Separator />

		<div class="grid grid-cols-2 gap-4 flex-1">
			<Card.Root>
				<Card.Header class="flex-row items-center gap-2">
					<CodeIcon class="size-4 text-primary" />
					<div>
						<Card.Title>Component-Based Slides</Card.Title>
						<Card.Description>Svelte + shadcn/ui</Card.Description>
					</div>
				</Card.Header>
				<Card.Content>
					<p class="text-muted-foreground text-xs leading-relaxed">
						Each slide is a self-contained Svelte component using shadcn primitives. Add new slides
						by creating components.
					</p>
				</Card.Content>
				<Card.Footer>
					<Button variant="ghost" size="sm">
						Learn more <ArrowRightIcon class="size-4" />
					</Button>
				</Card.Footer>
			</Card.Root>

			<Card.Root>
				<Card.Header class="flex-row items-center gap-2">
					<PaletteIcon class="size-4 text-primary" />
					<div>
						<Card.Title>Themeable</Card.Title>
						<Card.Description>Light & dark mode</Card.Description>
					</div>
				</Card.Header>
				<Card.Content>
					<p class="text-muted-foreground text-xs leading-relaxed">
						Uses the app's native theme. Toggle dark mode with the light switch and slides update
						instantly.
					</p>
				</Card.Content>
				<Card.Footer>
					<Button variant="ghost" size="sm">
						Learn more <ArrowRightIcon class="size-4" />
					</Button>
				</Card.Footer>
			</Card.Root>

			<Card.Root>
				<Card.Header class="flex-row items-center gap-2">
					<ZapIcon class="size-4 text-primary" />
					<div>
						<Card.Title>Fullscreen Presentation</Card.Title>
						<Card.Description>Press F to present</Card.Description>
					</div>
				</Card.Header>
				<Card.Content>
					<p class="text-muted-foreground text-xs leading-relaxed">
						Arrow keys navigate between slides. Press F for fullscreen or use the maximize button.
						Escape to exit.
					</p>
				</Card.Content>
				<Card.Footer>
					<Button variant="ghost" size="sm">
						Learn more <ArrowRightIcon class="size-4" />
					</Button>
				</Card.Footer>
			</Card.Root>

			<Card.Root>
				<Card.Header class="flex-row items-center gap-2">
					<GlobeIcon class="size-4 text-primary" />
					<div>
						<Card.Title>Preview Navigation</Card.Title>
						<Card.Description>Client-side slide switching</Card.Description>
					</div>
				</Card.Header>
				<Card.Content>
					<p class="text-muted-foreground text-xs leading-relaxed">
						The preview page shows one slide at a time with prev/next buttons and a slide counter.
					</p>
				</Card.Content>
				<Card.Footer>
					<Button variant="ghost" size="sm">
						Learn more <ArrowRightIcon class="size-4" />
					</Button>
				</Card.Footer>
			</Card.Root>
		</div>
	</div>
</SlideContainer>
