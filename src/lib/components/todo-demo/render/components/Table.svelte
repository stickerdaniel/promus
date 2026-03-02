<script lang="ts">
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';
	import * as TableUI from '$lib/components/ui/table/index.js';

	type Props = BaseComponentProps<{
		columns: Array<{ key: string; label: string }>;
		data: Array<Record<string, unknown>>;
	}>;

	let { props }: Props = $props();

	let sortKey: string | null = $state(null);
	let sortDir: 'asc' | 'desc' = $state('asc');

	function handleSort(key: string) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'asc';
		}
	}

	const sortedData = $derived.by(() => {
		if (!sortKey) return props.data ?? [];
		const key = sortKey;
		const dir = sortDir;
		return [...(props.data ?? [])].sort((a, b) => {
			const aVal = a[key];
			const bVal = b[key];
			if (aVal == null && bVal == null) return 0;
			if (aVal == null) return 1;
			if (bVal == null) return -1;
			if (typeof aVal === 'number' && typeof bVal === 'number') {
				return dir === 'asc' ? aVal - bVal : bVal - aVal;
			}
			const aStr = String(aVal);
			const bStr = String(bVal);
			return dir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
		});
	});
</script>

<TableUI.Root>
	<TableUI.Header>
		<TableUI.Row>
			{#each props.columns ?? [] as col (col.key)}
				<TableUI.Head>
					<button
						type="button"
						class="inline-flex items-center gap-1 hover:text-foreground"
						onclick={() => handleSort(col.key)}
					>
						{col.label}
						{#if sortKey === col.key}
							<span class="text-xs">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
						{/if}
					</button>
				</TableUI.Head>
			{/each}
		</TableUI.Row>
	</TableUI.Header>
	<TableUI.Body>
		{#each sortedData as row, i (i)}
			<TableUI.Row>
				{#each props.columns ?? [] as col (col.key)}
					<TableUI.Cell>{String(row[col.key] ?? '')}</TableUI.Cell>
				{/each}
			</TableUI.Row>
		{/each}
	</TableUI.Body>
</TableUI.Root>
