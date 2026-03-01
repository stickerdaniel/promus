<script lang="ts">
	import SlideContainer from './slide-container.svelte';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PrinterIcon from '@lucide/svelte/icons/printer';
</script>

<SlideContainer>
	<div class="flex flex-col justify-center h-full gap-8" style="padding: var(--slide-padding);">
		<div class="flex flex-col gap-4">
			<Badge variant="secondary" class="w-fit text-sm px-3 py-1">Presentation</Badge>
			<h1 class="text-foreground text-5xl font-bold leading-tight">Slideshow Template</h1>
			<Separator />
			<p class="text-muted-foreground text-lg max-w-[600px] leading-relaxed">
				A three-slide deck built with shadcn components and exported as PDF via Playwright.
			</p>
		</div>

		<div class="flex gap-4">
			<Card.Root class="flex-1">
				<Card.Header class="flex-row items-center gap-2">
					<LayersIcon class="size-4 text-primary" />
					<Card.Title>3 Slides</Card.Title>
				</Card.Header>
				<Card.Content>
					<p class="text-muted-foreground text-xs">
						Title, content, and closing slide with navigation controls.
					</p>
				</Card.Content>
			</Card.Root>
			<Card.Root class="flex-1">
				<Card.Header class="flex-row items-center gap-2">
					<FileTextIcon class="size-4 text-primary" />
					<Card.Title>shadcn/ui</Card.Title>
				</Card.Header>
				<Card.Content>
					<p class="text-muted-foreground text-xs">
						Cards, badges, buttons, and separators from the component library.
					</p>
				</Card.Content>
			</Card.Root>
			<Card.Root class="flex-1">
				<Card.Header class="flex-row items-center gap-2">
					<PrinterIcon class="size-4 text-primary" />
					<Card.Title>PDF Export</Card.Title>
				</Card.Header>
				<Card.Content>
					<p class="text-muted-foreground text-xs">
						Playwright renders each slide as a page in a multi-page PDF.
					</p>
				</Card.Content>
			</Card.Root>
		</div>

		<p class="text-muted-foreground text-xs mt-auto">promus / slideshow</p>
	</div>
</SlideContainer>
