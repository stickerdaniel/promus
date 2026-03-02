<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';
	import * as CardUI from '$lib/components/ui/card/index.js';

	interface Props extends BaseComponentProps<{
		title?: string | null;
		description?: string | null;
	}> {
		children?: Snippet;
	}

	let { props, children }: Props = $props();
</script>

<CardUI.Root>
	{#if props.title || props.description}
		<CardUI.Header>
			{#if props.title}
				<CardUI.Title>{props.title}</CardUI.Title>
			{/if}
			{#if props.description}
				<CardUI.Description>{props.description}</CardUI.Description>
			{/if}
		</CardUI.Header>
	{/if}
	<CardUI.Content>
		{#if children}{@render children()}{/if}
	</CardUI.Content>
</CardUI.Root>
