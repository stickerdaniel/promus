<script lang="ts">
	import Renderer from '$lib/components/json-render/Renderer.svelte';
	import JsonUIProvider from '$lib/components/json-render/JsonUIProvider.svelte';
	import type { Spec } from '@json-render/core';
	import { registry } from './registry.js';

	let {
		spec,
		onStateChange
	}: {
		spec: Spec;
		onStateChange?: (changes: Array<{ path: string; value: unknown }>) => void;
	} = $props();
</script>

<JsonUIProvider initialState={spec.state} {onStateChange}>
	<Renderer {spec} {registry} />
</JsonUIProvider>
