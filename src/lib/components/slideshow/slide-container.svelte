<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div
	class="bg-background text-foreground overflow-hidden relative"
	style="width: var(--slide-width); height: var(--slide-height);"
>
	{@render children()}
</div>
