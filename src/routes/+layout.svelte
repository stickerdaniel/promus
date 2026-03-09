<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { env } from '$env/dynamic/public';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { setupAutumn } from '@stickerdaniel/convex-autumn-svelte/sveltekit';
	import { ModeWatcher } from 'mode-watcher';
	import { initPosthog } from '$lib/analytics/posthog';
	import { authClient } from '$lib/auth-client';
	import { api } from '$lib/convex/_generated/api';
	import RouteProgress from '$lib/components/RouteProgress.svelte';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import './layout.css';

	let { children, data } = $props();

	// Deferred PostHog initialization - loads after interaction or idle
	onMount(function onMountPosthogInit() {
		const PUBLIC_POSTHOG_API_KEY = env.PUBLIC_POSTHOG_API_KEY;
		const PUBLIC_POSTHOG_HOST = env.PUBLIC_POSTHOG_HOST;
		if (!PUBLIC_POSTHOG_API_KEY || !PUBLIC_POSTHOG_HOST) return;

		let initialized = false;
		let timeoutId: number | null = null;
		let idleId: number | null = null;
		const { requestIdleCallback, cancelIdleCallback } = window as Window & {
			requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
			cancelIdleCallback?: (id: number) => void;
		};

		const interactionEvents: Array<keyof WindowEventMap> = [
			'pointerdown',
			'keydown',
			'scroll',
			'touchstart'
		];

		function initOnce(): void {
			if (initialized) return;
			initialized = true;
			initPosthog();
			cleanup();
		}

		function onUserInteraction(): void {
			initOnce();
		}

		function cleanup(): void {
			for (const eventName of interactionEvents) {
				window.removeEventListener(eventName, onUserInteraction);
			}
			if (idleId !== null && cancelIdleCallback) {
				cancelIdleCallback(idleId);
			}
			if (timeoutId !== null) {
				clearTimeout(timeoutId);
			}
		}

		for (const eventName of interactionEvents) {
			window.addEventListener(eventName, onUserInteraction, { passive: true, once: true });
		}

		if (requestIdleCallback) {
			idleId = requestIdleCallback(initOnce, { timeout: 3000 });
		} else {
			timeoutId = window.setTimeout(initOnce, 3000);
		}

		return cleanup;
	});

	// Initialize Better Auth client
	createSvelteAuthClient({
		authClient,
		getServerState() {
			return data.authState;
		}
	});

	// Setup Autumn with SSR support and auto-invalidation
	setupAutumn({
		convexApi: (api as any).autumn,
		getServerState() {
			return data.autumnState;
		},
		invalidate
	});
</script>

<ModeWatcher />
<SEOHead />
<Toaster />

<RouteProgress />

<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>
