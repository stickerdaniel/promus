<script lang="ts">
	import type { BaseComponentProps } from '$lib/components/json-render/catalog-types.js';
	import { getStateContext } from '$lib/components/json-render/contexts/StateProvider.svelte';
	import Input from '$lib/components/ui/input/input.svelte';

	type Props = BaseComponentProps<{
		label?: string | null;
		value?: string | null;
		placeholder?: string | null;
	}>;

	let { props, bindings }: Props = $props();

	const stateCtx = getStateContext();

	function handleInput(e: Event) {
		const val = (e.target as HTMLInputElement).value;
		const path = bindings?.value;
		if (path && stateCtx) {
			stateCtx.set(path, val);
		}
	}
</script>

<label>
	{#if props.label}
		<span class="text-sm font-medium">{props.label}</span>
	{/if}
	<Input value={props.value ?? ''} placeholder={props.placeholder ?? ''} oninput={handleInput} />
</label>
