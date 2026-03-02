<script lang="ts">
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';
	import { Progress } from '$lib/components/ui/progress/index.js';

	type Props = BaseComponentProps<{
		value: number;
		max?: number | null;
	}>;

	let { props }: Props = $props();
</script>

<Progress value={props.value} max={props.max ?? 100} />
