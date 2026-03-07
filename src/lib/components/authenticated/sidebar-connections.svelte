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
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import UnplugIcon from '@lucide/svelte/icons/unplug';
	import ChatgptConnectDialog from '$lib/components/todo-demo/chatgpt-connect-dialog.svelte';
	import { haptic } from '$lib/hooks/use-haptic.svelte';

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
		{ type: 'GOOGLE_OAUTH', labelKey: 'sidebar.connections.google' },
		{ type: 'OUTLOOK', labelKey: 'sidebar.connections.outlook' },
		{ type: 'WHATSAPP', labelKey: 'sidebar.connections.whatsapp' },
		{ type: 'INSTAGRAM', labelKey: 'sidebar.connections.instagram' },
		{ type: 'MESSENGER', labelKey: 'sidebar.connections.messenger' },
		{ type: 'TELEGRAM', labelKey: 'sidebar.connections.telegram' },
		{ type: 'TWITTER', labelKey: 'sidebar.connections.twitter' },
		{ type: 'MAIL', labelKey: 'sidebar.connections.imap' }
	] as const;

	let accounts = $state<Account[]>([]);
	let accountsLoaded = $state(false);
	let isLoading = $state(false);
	let connectingProvider = $state<string | null>(null);

	// Reactive query: auto-updates when webhook completes or expires
	const pendingAuth = useQuery(api.unipile.checkPendingAuthStatus, {});
	let lastPendingStatus = $state<string | null>(null);

	$effect(() => {
		const status = pendingAuth.data?.status;
		if (!status || status === lastPendingStatus) return;

		if (status === 'completed' && lastPendingStatus === 'pending') {
			loadAccounts();
		} else if (status === 'expired' && lastPendingStatus === 'pending') {
			haptic.trigger('error');
			toast.error($t('settings.connections.connect_failed'));
		}

		lastPendingStatus = status;
	});

	$effect(() => {
		loadAccounts();
	});

	useEventListener(
		() => document,
		'visibilitychange',
		() => {
			if (document.visibilityState !== 'visible' || isLoading) return;
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
			window.open(url, '_blank');
		} catch {
			haptic.trigger('error');
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
					haptic.trigger('success');
					toast.success($t('settings.connections.disconnected'));
					await loadAccounts();
				} catch (err) {
					haptic.trigger('error');
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

	function handleOpenAIConnect() {
		openaiDialogOpen = true;
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
					haptic.trigger('success');
					toast.success($t('settings.connections.openai_disconnected'));
				} catch {
					haptic.trigger('error');
					toast.error($t('settings.connections.openai_disconnect_failed'));
				} finally {
					openaiDisconnecting = false;
				}
			}
		});
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
										<span class="text-xs text-muted-foreground">
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
						<div class="absolute top-1 right-1 group-data-[collapsible=icon]:hidden">
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
											<span class="text-xs text-muted-foreground">
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
							<div class="absolute top-1 right-1 group-data-[collapsible=icon]:hidden">
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

<ChatgptConnectDialog bind:open={openaiDialogOpen} />

<ConfirmDeleteDialog />
