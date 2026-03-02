<script lang="ts">
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = BaseComponentProps<{
		label: string;
		variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null;
		size?: 'default' | 'sm' | 'lg' | 'icon' | null;
		disabled?: boolean | null;
	}>;

	let { props, emit, loading }: Props = $props();
</script>

<Button
	variant={props.variant ?? 'default'}
	size={props.size ?? 'default'}
	disabled={props.disabled ?? false}
	{loading}
	onclick={() => emit('press')}
>
	{props.label}
</Button>
