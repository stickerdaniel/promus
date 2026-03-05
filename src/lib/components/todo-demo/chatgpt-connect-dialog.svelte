<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$lib/convex/_generated/api';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { CopyButton } from '$lib/components/ui/copy-button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { toast } from 'svelte-sonner';
	import { T, getTranslate } from '@tolgee/svelte';
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
						toast.success($t('settings.connections.openai_connected'));
						return;
					}

					if (status === 'failed') {
						cleanupPolling();
						open = false;
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
					toast.error($t('settings.connections.openai_timeout'));
				},
				5 * 60 * 1000
			);
		} catch {
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

		{#if deviceCode}
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
							<p class="text-sm font-medium leading-none">
								<T keyName="settings.connections.openai_step1_label" />
							</p>
							<Button class="w-full" onclick={() => window.open(verificationUrl, '_blank')}>
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
							<p class="text-sm font-medium leading-none">
								<T keyName="settings.connections.openai_step2_label" />
							</p>
							<div class="flex items-center gap-2">
								<code
									class="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-muted px-4 font-mono text-xl font-bold tracking-widest"
								>
									{deviceCode}
								</code>
								<CopyButton text={deviceCode} variant="outline" />
							</div>
						</Field.Field>
					</div>
				</Field.Group>

				<!-- Waiting -->
				<div class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
					<LoaderCircleIcon class="h-4 w-4 animate-spin" />
					<T keyName="settings.connections.openai_waiting" />
				</div>
			</div>
		{:else}
			<div class="flex items-center justify-center py-8">
				<LoaderCircleIcon class="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="ghost" onclick={() => handleOpenChange(false)}>
				<T keyName="common.cancel" />
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
