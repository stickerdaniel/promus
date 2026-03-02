<script lang="ts">
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';

	type Props = BaseComponentProps<{
		text: string;
		level?: 1 | 2 | 3 | 4 | null;
	}>;

	let { props }: Props = $props();

	const level = $derived(props.level ?? 2);
</script>

{#if level === 1}
	<h1 class="text-3xl font-bold tracking-tight">{props.text}</h1>
{:else if level === 2}
	<h2 class="text-2xl font-semibold tracking-tight">{props.text}</h2>
{:else if level === 3}
	<h3 class="text-xl font-semibold">{props.text}</h3>
{:else}
	<h4 class="text-lg font-medium">{props.text}</h4>
{/if}
