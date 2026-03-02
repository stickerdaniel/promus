<script lang="ts">
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';
	import TrendingUpIcon from '@lucide/svelte/icons/trending-up';
	import TrendingDownIcon from '@lucide/svelte/icons/trending-down';
	import MinusIcon from '@lucide/svelte/icons/minus';

	type Props = BaseComponentProps<{
		label: string;
		value: string;
		detail?: string | null;
		trend?: 'up' | 'down' | 'flat' | null;
	}>;

	let { props }: Props = $props();
</script>

<div class="flex flex-col gap-1">
	<span class="text-sm text-muted-foreground">{props.label}</span>
	<div class="flex items-center gap-2">
		<span class="text-2xl font-bold">{props.value}</span>
		{#if props.trend === 'up'}
			<TrendingUpIcon class="size-4 text-green-500" />
		{:else if props.trend === 'down'}
			<TrendingDownIcon class="size-4 text-red-500" />
		{:else if props.trend === 'flat'}
			<MinusIcon class="size-4 text-muted-foreground" />
		{/if}
	</div>
	{#if props.detail}
		<span class="text-sm text-muted-foreground">{props.detail}</span>
	{/if}
</div>
