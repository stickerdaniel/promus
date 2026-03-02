<script lang="ts">
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';

	type Props = BaseComponentProps<{
		content: string;
		muted?: boolean | null;
	}>;

	let { props }: Props = $props();
</script>

<p class={props.muted ? 'text-muted-foreground' : ''}>{props.content}</p>
