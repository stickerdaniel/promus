<script lang="ts">
	import { onMount } from 'svelte';
	import { useGlobalSearchContext } from './context.svelte';

	const globalSearch = useGlobalSearchContext();

	let RealMenu: typeof import('./command-menu.svelte').default | null = $state(null);
	let loading = $state(false);

	async function loadMenu(): Promise<void> {
		if (RealMenu || loading) return;
		loading = true;
		const mod = await import('./command-menu.svelte');
		RealMenu = mod.default;
	}

	function isTypingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return (
			target.isContentEditable ||
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement
		);
	}

	/** Handle Cmd+K / Ctrl+K before the real menu loads */
	function handleKeydown(e: KeyboardEvent): void {
		// Once the real menu is loaded, it handles its own keydown
		if (RealMenu) return;

		if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
			if (isTypingTarget(e.target)) return;
			e.preventDefault();

			// Eagerly load + open
			loadMenu().then(() => {
				globalSearch.openMenu();
			});
		}
	}

	onMount(() => {
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
			loadMenu();
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
			idleId = win.requestIdleCallback(initOnce, { timeout: 4000 });
		} else {
			timeoutId = window.setTimeout(initOnce, 4000);
		}

		return cleanup;
	});
</script>

<svelte:document onkeydown={handleKeydown} />

{#if RealMenu}
	<RealMenu />
{/if}
