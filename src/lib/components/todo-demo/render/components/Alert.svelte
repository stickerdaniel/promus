<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';

	interface Props extends BaseComponentProps<{
		title?: string | null;
		message?: string | null;
		variant?: 'default' | 'destructive' | null;
	}> {
		children?: Snippet;
	}

	let { props, children }: Props = $props();

	const isDestructive = $derived(props.variant === 'destructive');
</script>

<div
	class="rounded-lg border p-4 {isDestructive
		? 'border-destructive bg-destructive/10'
		: 'border-border bg-muted/50'}"
	role="alert"
>
	{#if props.title}
		<p class="mb-1 font-medium {isDestructive ? 'text-destructive' : ''}">{props.title}</p>
	{/if}
	{#if props.message}
		<p class="text-sm {isDestructive ? 'text-destructive/90' : 'text-muted-foreground'}">
			{props.message}
		</p>
	{/if}
	{#if children}{@render children()}{/if}
</div>
