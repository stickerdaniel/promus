<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	let RealComponent: typeof import('./customer-support.svelte').default | null = $state(null);
	let loading = $state(false);

	const shouldOpenFromUrl = $derived(page.url.searchParams.get('support') === 'open');

	async function loadComponent(): Promise<void> {
		if (RealComponent || loading) return;
		loading = true;
		const mod = await import('./customer-support.svelte');
		RealComponent = mod.default;
	}

	onMount(() => {
		// If URL says open, load immediately
		if (shouldOpenFromUrl) {
			loadComponent();
			return;
		}

		// Otherwise defer until idle or first interaction
		const win = window as Window & {
			requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
			cancelIdleCallback?: (id: number) => void;
		};

		const interactionEvents: Array<keyof WindowEventMap> = [
			'pointerdown',
			'keydown',
			'scroll',
			'touchstart'
		];

		let started = false;
		let idleId: number | null = null;
		let timeoutId: number | null = null;

		function initOnce(): void {
			if (started) return;
			started = true;
			loadComponent();
			cleanup();
		}

		function cleanup(): void {
			for (const ev of interactionEvents) {
				window.removeEventListener(ev, initOnce);
			}
			if (idleId !== null && win.cancelIdleCallback) win.cancelIdleCallback(idleId);
			if (timeoutId !== null) clearTimeout(timeoutId);
		}

		for (const ev of interactionEvents) {
			window.addEventListener(ev, initOnce, { passive: true, once: true });
		}

		if (win.requestIdleCallback) {
			idleId = win.requestIdleCallback(initOnce, { timeout: 5000 });
		} else {
			timeoutId = window.setTimeout(initOnce, 5000);
		}

		return cleanup;
	});
</script>

{#if RealComponent}
	<RealComponent />
{/if}
