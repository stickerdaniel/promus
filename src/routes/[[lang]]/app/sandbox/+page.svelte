<script lang="ts">
	import { api } from '$lib/convex/_generated/api';
	import SEOHead from '$lib/components/SEOHead.svelte';
	import AppPageTitle from '$lib/components/app/app-page-title.svelte';
	import SandboxStatus from '$lib/components/sandbox/sandbox-status.svelte';
	import ChatRoot from '$lib/chat/ui/ChatRoot.svelte';
	import ChatMessages from '$lib/chat/ui/ChatMessages.svelte';
	import ChatInput from '$lib/chat/ui/ChatInput.svelte';
	import { useQuery } from 'convex-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import PlayIcon from '@lucide/svelte/icons/play';
	import SquareIcon from '@lucide/svelte/icons/square';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { getTranslate } from '@tolgee/svelte';

	const { t } = getTranslate();

	const session = useQuery(api.sandboxApi.getSession, {});

	let isStarting = $state(false);
	let isManaging = $state(false);

	const sessionStatus = $derived(session.data?.status ?? 'none');
	const isReady = $derived(sessionStatus === 'ready');
	const threadId = $derived(session.data?.threadId ?? null);

	const sandboxChatApi = {
		sendMessage: api.sandboxApi.sendMessage,
		createThread: api.sandboxApi.createThread,
		listMessages: api.sandboxApi.listMessages
	};

	async function startSandbox() {
		isStarting = true;
		try {
			const res = await fetch('/api/sandbox/manage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'start' })
			});
			if (!res.ok) {
				const text = await res.text();
				console.error('Failed to start sandbox:', text);
			}
		} catch (e) {
			console.error('Failed to start sandbox:', e);
		} finally {
			isStarting = false;
		}
	}

	async function manageSandbox(action: 'stop' | 'delete') {
		isManaging = true;
		try {
			await fetch('/api/sandbox/manage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action })
			});
		} catch (e) {
			console.error(`Failed to ${action} sandbox:`, e);
		} finally {
			isManaging = false;
		}
	}
</script>

<SEOHead title={$t('meta.app.sandbox.title')} description={$t('meta.app.sandbox.description')} />

<div class="flex h-[calc(100dvh-var(--header-height))] flex-col px-4 lg:px-6">
	<!-- Header -->
	<div class="flex items-center justify-between py-4">
		<div class="flex items-center gap-3">
			<AppPageTitle
				title={$t('sandbox.title', { defaultValue: 'Vibe Sandbox' })}
				description={$t('sandbox.description', {
					defaultValue: 'AI-powered coding assistant running in a cloud sandbox'
				})}
			/>
			{#if session.data}
				<SandboxStatus status={session.data.status} />
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if isReady}
				<Button
					variant="outline"
					size="sm"
					onclick={() => manageSandbox('stop')}
					disabled={isManaging}
				>
					<SquareIcon class="mr-1.5 size-3.5" />
					{$t('sandbox.stop_sandbox')}
				</Button>
			{/if}
			{#if session.data && session.data.status !== 'deleted'}
				<Button
					variant="outline"
					size="sm"
					onclick={() => manageSandbox('delete')}
					disabled={isManaging}
				>
					<Trash2Icon class="mr-1.5 size-3.5" />
					{$t('sandbox.delete_sandbox', { defaultValue: 'Delete' })}
				</Button>
			{/if}
		</div>
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-hidden rounded-lg border">
		{#if !session.data || session.data.status === 'deleted'}
			<!-- No session - show start button -->
			<div class="flex h-full items-center justify-center">
				<div class="text-center">
					<p class="mb-4 text-muted-foreground">
						{$t('sandbox.empty_state', {
							defaultValue: 'Start a sandbox to begin coding with Vibe'
						})}
					</p>
					<Button onclick={startSandbox} disabled={isStarting} data-testid="sandbox-start">
						<PlayIcon class="mr-1.5 size-4" />
						{isStarting ? $t('sandbox.status.creating') : $t('sandbox.start_sandbox')}
					</Button>
				</div>
			</div>
		{:else if session.data.status === 'creating'}
			<div class="flex h-full items-center justify-center">
				<div class="text-center">
					<div
						class="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
					></div>
					<p class="text-muted-foreground">{$t('sandbox.status.creating')}</p>
				</div>
			</div>
		{:else if session.data.status === 'error'}
			<div class="flex h-full items-center justify-center">
				<div class="text-center">
					<p class="mb-2 text-destructive">{$t('sandbox.status.error')}</p>
					{#if session.data.errorMessage}
						<p class="mb-4 text-sm text-muted-foreground">{session.data.errorMessage}</p>
					{/if}
					<Button variant="outline" onclick={() => manageSandbox('delete')} disabled={isManaging}>
						{$t('sandbox.delete_sandbox', { defaultValue: 'Delete & Retry' })}
					</Button>
				</div>
			</div>
		{:else if session.data.status === 'ready' && threadId}
			<!-- Chat powered by Convex Agent -->
			<ChatRoot {threadId} api={sandboxChatApi}>
				<div class="flex h-full flex-col">
					<ChatMessages class="flex-1" />
					<div class="border-t p-4">
						<ChatInput
							placeholder={$t('sandbox.input_placeholder')}
							showFileButton={false}
							showHandoffButton={false}
							showCameraButton={false}
						/>
					</div>
				</div>
			</ChatRoot>
		{:else}
			<!-- Session exists but no thread yet (stopped state, etc.) -->
			<div class="flex h-full items-center justify-center">
				<div class="text-center">
					<p class="mb-4 text-muted-foreground">
						{$t('sandbox.empty_state', {
							defaultValue: 'Start a sandbox to begin coding with Vibe'
						})}
					</p>
					<Button onclick={startSandbox} disabled={isStarting} data-testid="sandbox-start">
						<PlayIcon class="mr-1.5 size-4" />
						{isStarting ? $t('sandbox.status.creating') : $t('sandbox.start_sandbox')}
					</Button>
				</div>
			</div>
		{/if}
	</div>
</div>
