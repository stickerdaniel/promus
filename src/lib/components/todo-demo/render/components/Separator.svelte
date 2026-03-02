<script lang="ts">
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';
	import { Separator } from '$lib/components/ui/separator/index.js';

	type Props = BaseComponentProps<{
		orientation?: 'horizontal' | 'vertical' | null;
	}>;

	let { props }: Props = $props();
</script>

<Separator orientation={props.orientation ?? 'horizontal'} />
