<script lang="ts">
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	type Props = BaseComponentProps<{
		text: string;
		variant?: 'default' | 'secondary' | 'destructive' | 'outline' | null;
	}>;

	let { props }: Props = $props();
</script>

<Badge variant={props.variant ?? 'default'}>{props.text}</Badge>
