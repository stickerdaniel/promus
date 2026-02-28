<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$lib/convex/_generated/api';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Item from '$lib/components/ui/item/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { ConfirmDeleteDialog, confirmDelete } from '$lib/components/ui/confirm-delete-dialog';
	import { toast } from 'svelte-sonner';
	import { T, getTranslate } from '@tolgee/svelte';
	import { useEventListener } from 'runed';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	const { t } = getTranslate();
	const client = useConvexClient();

	type Account = {
		id: string;
		name: string;
		type: string;
		created_at: string;
		sources: Array<{ id: string; status: string }>;
	};

	let accounts = $state<Account[]>([]);
	let isLoading = $state(false);
	let isConnecting = $state(false);
	let error = $state('');

	$effect(() => {
		loadAccounts();
	});

	// Auto-refresh accounts when user returns from the auth wizard tab
	useEventListener(
		() => document,
		'visibilitychange',
		() => {
			if (document.visibilityState === 'visible' && !isLoading) {
				loadAccounts();
			}
		}
	);

	function deduplicateAccounts(items: Account[]): Account[] {
		const grouped: Record<string, Account[]> = {};
		for (const account of items) {
			const key = `${account.name}::${account.type}`;
			const group = grouped[key] ?? [];
			group.push(account);
			grouped[key] = group;
		}

		const keep: Account[] = [];
		for (const group of Object.values(grouped)) {
			if (group.length <= 1) {
				keep.push(group[0]);
				continue;
			}
			// Sort by created_at descending — keep the newest
			group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
			keep.push(group[0]);
			// Fire-and-forget delete for older duplicates
			for (let i = 1; i < group.length; i++) {
				client.action(api.unipile.deleteAccount, { accountId: group[i].id });
			}
		}
		return keep;
	}

	async function loadAccounts() {
		isLoading = true;
		error = '';
		try {
			const result = await client.action(api.unipile.listAccounts, {});
			accounts = deduplicateAccounts(result.items);
		} catch {
			error = 'settings.connections.load_failed';
		} finally {
			isLoading = false;
		}
	}

	async function handleConnect() {
		isConnecting = true;
		try {
			const { url } = await client.action(api.unipile.getHostedAuthLink, {});
			window.open(url, '_blank');
		} catch {
			toast.error($t('settings.connections.connect_failed'));
		} finally {
			isConnecting = false;
		}
	}

	function handleDisconnect(account: Account) {
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

	function formatType(type: string): string {
		return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
	}

	function getAccountStatus(account: Account): string {
		if (account.sources.length === 0) return 'OK';
		const statuses = account.sources.map((s) => s.status);
		if (statuses.some((s) => s === 'ERROR' || s === 'CREDENTIALS' || s === 'PERMISSIONS'))
			return 'ERROR';
		if (statuses.some((s) => s === 'CONNECTING')) return 'CONNECTING';
		return 'OK';
	}

	function getStatusBadgeVariant(
		status: string
	): 'default' | 'destructive' | 'secondary' | 'outline' {
		if (status === 'ERROR') return 'destructive';
		if (status === 'CONNECTING') return 'secondary';
		return 'default';
	}

	function getStatusLabel(status: string): string {
		if (status === 'ERROR') return $t('settings.connections.status_error');
		if (status === 'CONNECTING') return $t('settings.connections.status_connecting');
		return $t('settings.connections.status_ok');
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title><T keyName="settings.connections.title" /></Card.Title>
		<Card.Description><T keyName="settings.connections.description" /></Card.Description>
	</Card.Header>
	<Card.Content class="space-y-6">
		<!-- Info -->
		<Item.Root variant="muted">
			<Item.Media variant="icon">
				<LinkIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title><T keyName="settings.connections.info_title" /></Item.Title>
				<Item.Description>
					<T keyName="settings.connections.info_description" />
				</Item.Description>
			</Item.Content>
		</Item.Root>

		<!-- Connect Button -->
		<div>
			<Button onclick={handleConnect} disabled={isConnecting}>
				{#if isConnecting}
					<T keyName="settings.connections.connecting" />
				{:else}
					<PlusIcon />
					<T keyName="settings.connections.connect_button" />
				{/if}
			</Button>
		</div>

		<!-- Account List -->
		<div class="space-y-4">
			<h3 class="text-sm font-semibold">
				<T keyName="settings.connections.your_accounts_title" />
			</h3>

			{#if isLoading}
				<p class="text-muted-foreground text-sm">
					<T keyName="settings.connections.loading" />
				</p>
			{:else if accounts.length === 0}
				<p class="text-muted-foreground text-sm">
					<T keyName="settings.connections.no_accounts" />
				</p>
			{:else}
				<Item.Group class="gap-4">
					{#each accounts as account (account.id)}
						{@const status = getAccountStatus(account)}
						<Item.Root variant="outline">
							<Item.Media variant="icon">
								<LinkIcon />
							</Item.Media>
							<Item.Content>
								<Item.Title>
									{account.name || formatType(account.type)}
									<Badge variant={getStatusBadgeVariant(status)} class="ml-2">
										{getStatusLabel(status)}
									</Badge>
								</Item.Title>
								<Item.Description>
									{formatType(account.type)} &middot; {formatDate(account.created_at)}
								</Item.Description>
							</Item.Content>
							<Item.Actions>
								<Button
									variant="ghost"
									size="icon"
									onclick={() => handleDisconnect(account)}
									class="text-destructive hover:text-destructive"
								>
									<Trash2Icon class="h-4 w-4" />
								</Button>
							</Item.Actions>
						</Item.Root>
					{/each}
				</Item.Group>
			{/if}
		</div>

		{#if error}
			<Alert.Root variant="destructive">
				<Alert.Title><T keyName="settings.connections.error_title" /></Alert.Title>
				<Alert.Description>
					<T keyName={error} />
				</Alert.Description>
			</Alert.Root>
		{/if}
	</Card.Content>
</Card.Root>

<ConfirmDeleteDialog />
