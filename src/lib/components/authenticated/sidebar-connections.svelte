<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$lib/convex/_generated/api';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ConfirmDeleteDialog, confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
	import { toast } from 'svelte-sonner';
	import { T, getTranslate } from '@tolgee/svelte';
	import { useEventListener } from 'runed';
	import ProviderIcon from '$lib/components/icons/provider-icon.svelte';
	import EllipsisVerticalIcon from '@lucide/svelte/icons/ellipsis-vertical';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import UnplugIcon from '@lucide/svelte/icons/unplug';

	const { t } = getTranslate();
	const client = useConvexClient();

	const INERT_MENU_BUTTON =
		'cursor-default hover:bg-transparent hover:text-sidebar-foreground active:bg-transparent active:text-sidebar-foreground active:scale-100';

	// =========================================================================
	// Unipile section
	// =========================================================================

	type Account = {
		id: string;
		name: string;
		type: string;
		created_at: string;
		sources: Array<{ id: string; status: string }>;
	};

	const UNIPILE_PROVIDERS = [
		{ type: 'LINKEDIN', labelKey: 'sidebar.connections.linkedin' },
		{ type: 'GOOGLE', labelKey: 'sidebar.connections.gmail' },
		{ type: 'OUTLOOK', labelKey: 'sidebar.connections.outlook' },
		{ type: 'WHATSAPP', labelKey: 'sidebar.connections.whatsapp' },
		{ type: 'INSTAGRAM', labelKey: 'sidebar.connections.instagram' },
		{ type: 'MESSENGER', labelKey: 'sidebar.connections.messenger' },
		{ type: 'TELEGRAM', labelKey: 'sidebar.connections.telegram' },
		{ type: 'TWITTER', labelKey: 'sidebar.connections.twitter' }
	] as const;

	let accounts = $state<Account[]>([]);
	let accountsLoaded = $state(false);
	let isLoading = $state(false);
	let connectingProvider = $state<string | null>(null);
	let awaitingAuth = $state(false);

	$effect(() => {
		loadAccounts();
	});

	useEventListener(
		() => document,
		'visibilitychange',
		async () => {
			if (document.visibilityState !== 'visible' || isLoading) return;
			if (awaitingAuth) {
				awaitingAuth = false;
				try {
					await client.action(api.unipile.registerNewAccount, {});
				} catch {
					// Registration failure is non-fatal
				}
			}
			loadAccounts();
		}
	);

	function deduplicateAccounts(items: Account[]): {
		keep: Account[];
		duplicates: Account[];
	} {
		const grouped: Record<string, Account[]> = {};
		for (const account of items) {
			const key = account.name ? `${account.name}::${account.type}` : account.id;
			const group = grouped[key] ?? [];
			group.push(account);
			grouped[key] = group;
		}
		const keep: Account[] = [];
		const duplicates: Account[] = [];
		for (const group of Object.values(grouped)) {
			group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
			keep.push(group[0]);
			for (let i = 1; i < group.length; i++) {
				duplicates.push(group[i]);
			}
		}
		return { keep, duplicates };
	}

	async function loadAccounts() {
		isLoading = true;
		try {
			const result = await client.action(api.unipile.listAccounts, {});
			const { keep, duplicates } = deduplicateAccounts(result.items);
			accounts = keep;
			accountsLoaded = true;
			for (const dup of duplicates) {
				client.action(api.unipile.deleteAccount, { accountId: dup.id }).catch(() => {});
			}
		} catch {
			// Silent failure in sidebar
		} finally {
			isLoading = false;
		}
	}

	async function handleUnipileConnect(providerType: string) {
		connectingProvider = providerType;
		try {
			const { url } = await client.action(api.unipile.getHostedAuthLink, {});
			awaitingAuth = true;
			window.open(url, '_blank');
		} catch {
			toast.error($t('settings.connections.connect_failed'));
		} finally {
			connectingProvider = null;
		}
	}

	function handleUnipileDisconnect(account: Account) {
		confirmDelete({
			title: $t('settings.connections.disconnect_title'),
			description: $t('settings.connections.disconnect_description', {
				name: account.name,
				type: formatType(account.type)
			}),
			confirm: { text: $t('settings.connections.disconnect_confirm') },
			onConfirm: async () => {
				try {
					await client.action(api.unipile.deleteAccount, { accountId: account.id });
					toast.success($t('settings.connections.disconnected'));
					await loadAccounts();
				} catch (err) {
					toast.error($t('settings.connections.disconnect_failed'));
					throw err;
				}
			}
		});
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatTimestamp(ts: number): string {
		return new Date(ts).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatType(type: string): string {
		return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
	}

	function getConnectedAccount(providerType: string): Account | undefined {
		return accounts.find((a) => a.type.toUpperCase() === providerType);
	}

	// =========================================================================
	// OpenAI / ChatGPT section
	// =========================================================================

	const openaiConnection = useQuery(api.openai.getConnection, {});

	let openaiDialogOpen = $state(false);
	let openaiDisconnecting = $state(false);
	let deviceCode = $state('');
	let verificationUrl = $state('');
	let codeCopied = $state(false);
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

	async function handleOpenAIConnect() {
		connectingProvider = 'CHATGPT';
		try {
			const result = await client.action(api.openai.initiateDeviceAuth, {});
			deviceCode = result.userCode;
			verificationUrl = result.verificationUrl;
			openaiDialogOpen = true;

			const intervalMs = result.interval * 1000;
			pollingTimer = setInterval(async () => {
				try {
					const status = await client.action(api.openai.pollDeviceAuth, {
						deviceAuthId: result.deviceAuthId,
						userCode: result.userCode
					});

					if (status === 'success') {
						cleanupPolling();
						openaiDialogOpen = false;
						connectingProvider = null;
						toast.success($t('settings.connections.openai_connected'));
						return;
					}

					if (status === 'failed') {
						cleanupPolling();
						openaiDialogOpen = false;
						connectingProvider = null;
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
					openaiDialogOpen = false;
					connectingProvider = null;
					toast.error($t('settings.connections.openai_timeout'));
				},
				5 * 60 * 1000
			);
		} catch {
			toast.error($t('settings.connections.openai_connect_failed'));
			connectingProvider = null;
		}
	}

	function handleOpenAIDisconnect() {
		confirmDelete({
			title: $t('settings.connections.openai_disconnect'),
			description: $t('settings.connections.openai_disconnect_confirm'),
			confirm: { text: $t('settings.connections.openai_disconnect') },
			onConfirm: async () => {
				openaiDisconnecting = true;
				try {
					await client.action(api.openai.deleteConnection, {});
					toast.success($t('settings.connections.openai_disconnected'));
				} catch {
					toast.error($t('settings.connections.openai_disconnect_failed'));
				} finally {
					openaiDisconnecting = false;
				}
			}
		});
	}

	async function copyCode() {
		await navigator.clipboard.writeText(deviceCode);
		codeCopied = true;
		setTimeout(() => (codeCopied = false), 2000);
	}

	function handleDialogClose(open: boolean) {
		if (!open) {
			cleanupPolling();
			connectingProvider = null;
		}
		openaiDialogOpen = open;
	}
</script>

<!-- LLM Providers section — always visible -->
<Sidebar.Group>
	<Sidebar.GroupLabel>
		<T keyName="sidebar.connections.llm_providers" />
	</Sidebar.GroupLabel>
	<Sidebar.GroupContent>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton class="h-8 {INERT_MENU_BUTTON}">
					<ProviderIcon type="CHATGPT" class="size-5 shrink-0 rounded" />
					<span>ChatGPT</span>
				</Sidebar.MenuButton>
				{#if !openaiConnection.isLoading}
					{#if openaiConnection.data}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Sidebar.MenuAction {...props}>
										<EllipsisVerticalIcon class="size-4" />
									</Sidebar.MenuAction>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content side="right" align="start" class="w-56">
								<DropdownMenu.Label class="flex flex-col gap-1 font-normal">
									<span class="text-sm font-medium">
										{openaiConnection.data.email ?? 'ChatGPT'}
									</span>
									<span class="flex items-center gap-1.5">
										<span
											class="size-2 shrink-0 rounded-full {openaiConnection.data.isExpired
												? 'bg-red-500'
												: 'bg-green-500'}"
										></span>
										<span class="text-muted-foreground text-xs">
											{$t('sidebar.connections.connected_since', {
												date: formatTimestamp(openaiConnection.data.connectedAt)
											})}
										</span>
									</span>
								</DropdownMenu.Label>
								<DropdownMenu.Separator />
								<DropdownMenu.Item
									class="text-destructive focus:text-destructive"
									onclick={handleOpenAIDisconnect}
									disabled={openaiDisconnecting}
								>
									<UnplugIcon class="size-4" />
									<T keyName="sidebar.connections.remove" />
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					{:else}
						<div class="absolute right-1 top-1 group-data-[collapsible=icon]:hidden">
							<Button
								variant="outline"
								size="sm"
								class="relative h-6 px-2 text-xs"
								onclick={handleOpenAIConnect}
								disabled={connectingProvider === 'CHATGPT'}
							>
								<span class={connectingProvider === 'CHATGPT' ? 'invisible' : ''}>
									<T keyName="sidebar.connections.connect" />
								</span>
								{#if connectingProvider === 'CHATGPT'}
									<LoaderCircleIcon class="absolute size-3.5 animate-spin" />
								{/if}
							</Button>
						</div>
					{/if}
				{/if}
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.GroupContent>
</Sidebar.Group>

<!-- Connections section — always visible -->
<Sidebar.Group>
	<Sidebar.GroupLabel>
		<T keyName="sidebar.connections.connections" />
	</Sidebar.GroupLabel>
	<Sidebar.GroupContent>
		<Sidebar.Menu>
			{#each UNIPILE_PROVIDERS as provider (provider.type)}
				{@const connectedAccount = getConnectedAccount(provider.type)}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton class="h-8 {INERT_MENU_BUTTON}">
						<ProviderIcon type={provider.type} class="size-5 shrink-0 rounded" />
						<span><T keyName={provider.labelKey} /></span>
					</Sidebar.MenuButton>
					{#if accountsLoaded}
						{#if connectedAccount}
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Sidebar.MenuAction {...props}>
											<EllipsisVerticalIcon class="size-4" />
										</Sidebar.MenuAction>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content side="right" align="start" class="w-56">
									<DropdownMenu.Label class="flex flex-col gap-1 font-normal">
										<span class="text-sm font-medium">
											{connectedAccount.name || formatType(connectedAccount.type)}
										</span>
										<span class="flex items-center gap-1.5">
											<span class="size-2 shrink-0 rounded-full bg-green-500"></span>
											<span class="text-muted-foreground text-xs">
												{$t('sidebar.connections.connected_since', {
													date: formatDate(connectedAccount.created_at)
												})}
											</span>
										</span>
									</DropdownMenu.Label>
									<DropdownMenu.Separator />
									<DropdownMenu.Item
										class="text-destructive focus:text-destructive"
										onclick={() => handleUnipileDisconnect(connectedAccount)}
									>
										<UnplugIcon class="size-4" />
										<T keyName="sidebar.connections.remove" />
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						{:else}
							<div class="absolute right-1 top-1 group-data-[collapsible=icon]:hidden">
								<Button
									variant="outline"
									size="sm"
									class="relative h-6 px-2 text-xs"
									onclick={() => handleUnipileConnect(provider.type)}
									disabled={connectingProvider === provider.type}
								>
									<span class={connectingProvider === provider.type ? 'invisible' : ''}>
										<T keyName="sidebar.connections.connect" />
									</span>
									{#if connectingProvider === provider.type}
										<LoaderCircleIcon class="absolute size-3.5 animate-spin" />
									{/if}
								</Button>
							</div>
						{/if}
					{/if}
				</Sidebar.MenuItem>
			{/each}
		</Sidebar.Menu>
	</Sidebar.GroupContent>
</Sidebar.Group>

<!-- Device Code Dialog for OpenAI -->
<Dialog.Root open={openaiDialogOpen} onOpenChange={handleDialogClose}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title><T keyName="settings.connections.openai_device_code_title" /></Dialog.Title>
			<Dialog.Description>
				<T keyName="settings.connections.openai_device_code_description" />
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-4">
			<div class="flex items-center justify-center gap-3">
				<code
					class="bg-muted rounded-lg px-6 py-3 text-center font-mono text-2xl font-bold tracking-widest"
				>
					{deviceCode}
				</code>
				<Button variant="outline" size="icon" onclick={copyCode}>
					{#if codeCopied}
						<CheckIcon class="h-4 w-4" />
					{:else}
						<CopyIcon class="h-4 w-4" />
					{/if}
					<span class="sr-only"><T keyName="settings.connections.openai_copy_code" /></span>
				</Button>
			</div>

			<div class="flex justify-center">
				<Button variant="outline" onclick={() => window.open(verificationUrl, '_blank')}>
					<ExternalLinkIcon class="h-4 w-4" />
					<T keyName="settings.connections.openai_open_openai" />
				</Button>
			</div>

			<div class="text-muted-foreground flex items-center justify-center gap-2 text-sm">
				<LoaderCircleIcon class="h-4 w-4 animate-spin" />
				<T keyName="settings.connections.openai_waiting" />
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="ghost" onclick={() => handleDialogClose(false)}>
				<T keyName="common.cancel" />
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<ConfirmDeleteDialog />
