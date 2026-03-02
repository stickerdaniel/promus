<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';

	interface Props extends BaseComponentProps<{
		direction?: 'horizontal' | 'vertical' | null;
		gap?: 'sm' | 'md' | 'lg' | null;
		wrap?: boolean | null;
	}> {
		children?: Snippet;
	}

	let { props, children }: Props = $props();

	const gapClass = $derived(
		{ sm: 'gap-2', md: 'gap-4', lg: 'gap-6' }[props.gap ?? 'md'] ?? 'gap-4'
	);
</script>

<div
	class="{props.direction === 'horizontal' ? 'flex' : 'flex flex-col'} {gapClass} {props.wrap
		? 'flex-wrap'
		: ''}"
>
	{#if children}{@render children()}{/if}
</div>
