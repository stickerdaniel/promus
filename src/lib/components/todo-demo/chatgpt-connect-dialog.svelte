<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$lib/convex/_generated/api';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { CopyButton } from '$lib/components/ui/copy-button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { toast } from 'svelte-sonner';
	import { T, getTranslate } from '@tolgee/svelte';
	import { haptic } from '$lib/hooks/use-haptic.svelte';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';

	let {
		open = $bindable(false),
		description: descriptionKey = 'settings.connections.openai_device_code_description'
	}: {
		open: boolean;
		description?: string;
	} = $props();

	const { t } = getTranslate();
	const client = useConvexClient();

	let deviceCode = $state('');
	let verificationUrl = $state('');
	let initiating = $state(false);
	let pollingTimer = $state<ReturnType<typeof setInterval> | null>(null);
	let pollTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

	function cleanupPolling() {
		if (pollingTimer) {
			clearInterval(pollingTimer);
			pollingTimer = null;
		}
		if (pollTimeout) {
			clearTimeout(pollTimeout);
			pollTimeout = null;
		}
	}

	async function initiateAuth() {
		initiating = true;
		try {
			const result = await client.action(api.openai.initiateDeviceAuth, {});
			deviceCode = result.userCode;
			verificationUrl = result.verificationUrl;

			// Auto-copy code and open OpenAI immediately
			navigator.clipboard.writeText(result.userCode).catch(() => {});
			window.open(result.verificationUrl, '_blank');

			const intervalMs = result.interval * 1000;
			pollingTimer = setInterval(async () => {
				try {
					const status = await client.action(api.openai.pollDeviceAuth, {
						deviceAuthId: result.deviceAuthId,
						userCode: result.userCode
					});

					if (status === 'success') {
						cleanupPolling();
						open = false;
						haptic.trigger('success');
						toast.success($t('settings.connections.openai_connected'));
						return;
					}

					if (status === 'failed') {
						cleanupPolling();
						open = false;
						haptic.trigger('error');
						toast.error($t('settings.connections.openai_connect_failed'));
						return;
					}
				} catch {
					// Poll errors are non-fatal, keep trying
				}
			}, intervalMs);

			pollTimeout = setTimeout(
				() => {
					cleanupPolling();
					open = false;
					haptic.trigger('error');
					toast.error($t('settings.connections.openai_timeout'));
				},
				5 * 60 * 1000
			);
		} catch {
			haptic.trigger('error');
			toast.error($t('settings.connections.openai_connect_failed'));
			open = false;
		} finally {
			initiating = false;
		}
	}

	function handleOpenChange(next: boolean) {
		if (!next) {
			cleanupPolling();
		}
		open = next;
	}

	// Start auth flow when dialog opens
	$effect(() => {
		if (open && !deviceCode && !initiating) {
			initiateAuth();
		}
		if (!open) {
			deviceCode = '';
			verificationUrl = '';
		}
	});
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title><T keyName="settings.connections.openai_device_code_title" /></Dialog.Title>
			<Dialog.Description>
				<T keyName={descriptionKey} />
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 pt-3">
			<Field.Group>
				<!-- Step 1 -->
				<div class="flex items-start gap-4">
					<div
						class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
					>
						1
					</div>
					<Field.Field class="flex-1">
						<p class="text-sm leading-none font-medium">
							<T keyName="settings.connections.openai_step1_label" />
						</p>
						<Button
							class="w-full"
							disabled={initiating}
							onclick={() => window.open(verificationUrl, '_blank')}
						>
							<ExternalLinkIcon class="h-4 w-4" />
							<T keyName="settings.connections.openai_open_openai" />
						</Button>
					</Field.Field>
				</div>

				<!-- Step 2 -->
				<div class="flex items-start gap-4">
					<div
						class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
					>
						2
					</div>
					<Field.Field class="flex-1">
						<p class="text-sm leading-none font-medium">
							<T keyName="settings.connections.openai_step2_label" />
						</p>
						<div class="flex items-center gap-2">
							{#if deviceCode}
								<code
									class="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-muted px-4 font-mono text-xl font-bold tracking-widest"
								>
									{deviceCode}
								</code>
								<CopyButton text={deviceCode} variant="outline" />
							{:else}
								<div
									class="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-muted px-4"
								>
									<div class="h-5 w-44 animate-pulse rounded bg-muted-foreground/20"></div>
								</div>
							{/if}
						</div>
					</Field.Field>
				</div>
			</Field.Group>

			<!-- Waiting -->
			{#if deviceCode}
				<div class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
					<LoaderCircleIcon class="h-4 w-4 animate-spin" />
					<T keyName="settings.connections.openai_waiting" />
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="ghost" onclick={() => handleOpenChange(false)}>
				<T keyName="common.cancel" />
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
