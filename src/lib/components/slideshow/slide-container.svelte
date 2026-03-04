<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div
	class="relative overflow-hidden bg-background text-foreground"
	style="width: var(--slide-width); height: var(--slide-height);"
>
	{@render children()}
</div>
