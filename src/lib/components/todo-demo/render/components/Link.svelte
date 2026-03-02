<script lang="ts">
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';

	type Props = BaseComponentProps<{
		href: string;
		text: string;
	}>;

	let { props }: Props = $props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- external URLs are not app routes -->
<a
	href={props.href}
	target="_blank"
	rel="noopener noreferrer"
	class="text-primary underline underline-offset-4 hover:text-primary/80"
>
	{props.text}
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
