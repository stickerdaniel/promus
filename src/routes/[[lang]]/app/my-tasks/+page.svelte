<script lang="ts">
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { getTranslate, T } from '@tolgee/svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$lib/convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { useEventListener } from 'runed';
	import { toast } from 'svelte-sonner';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import KanbanBoard from '$lib/components/todo-demo/kanban-board.svelte';

	const sandboxSession = useQuery(api.sandboxApi.getSession, {});

	const sandboxStatus = $derived.by(() => {
		const s = sandboxSession.data;
		if (s === undefined && !sandboxSession.error) return { label: '...', color: 'bg-yellow-500' };
		if (!s) return { label: 'Off', color: 'bg-zinc-400' };
		switch (s.status) {
			case 'ready':
				return { label: 'Ready', color: 'bg-green-500' };
			case 'creating':
				return { label: 'Starting', color: 'bg-yellow-500' };
			case 'stopped':
				return { label: 'Stopped', color: 'bg-zinc-400' };
			case 'error':
				return { label: 'Error', color: 'bg-red-500' };
			default:
				return { label: s.status, color: 'bg-zinc-400' };
		}
	});

	const { t } = getTranslate();
	const client = useConvexClient();
	const isUnipileEnabled = useQuery(api.unipile.isUnipileEnabled, {});

	type Account = {
		id: string;
		name: string;
		type: string;
		created_at: string;
		sources: Array<{ id: string; status: string }>;
	};

	let accounts = $state<Account[]>([]);
	let isLoading = $state(false);

	$effect(() => {
		if (isUnipileEnabled.data?.enabled) {
			loadAccounts();
		}
	});

	useEventListener(
		() => document,
		'visibilitychange',
		() => {
			if (document.visibilityState === 'visible' && !isLoading && isUnipileEnabled.data?.enabled) {
				loadAccounts();
			}
		}
	);

	function deduplicateAccounts(items: Account[]): Account[] {
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
		for (const dup of duplicates) {
			client.action(api.unipile.deleteAccount, { accountId: dup.id }).catch(() => {});
		}
		return keep;
	}

	async function loadAccounts() {
		isLoading = true;
		try {
			const result = await client.action(api.unipile.listAccounts, {});
			accounts = deduplicateAccounts(result.items);
		} catch {
			// Silently fail — settings page handles full error display
		} finally {
			isLoading = false;
		}
	}

	async function handleConnect() {
		try {
			const { url } = await client.action(api.unipile.getHostedAuthLink, {});
			window.open(url, '_blank');
		} catch {
			toast.error($t('settings.connections.connect_failed'));
		}
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

	function getStatusDotColor(status: string): string {
		if (status === 'ERROR') return 'bg-red-500';
		if (status === 'CONNECTING') return 'bg-yellow-500';
		return 'bg-green-500';
	}
</script>

<SEOHead
	title={$t('meta.app.dashboard.title')}
	description={$t('meta.app.dashboard.description')}
/>

<div class="px-4 py-6 lg:px-6">
	<div class="mb-4 flex flex-wrap items-center gap-2">
		{#if isUnipileEnabled.data?.enabled}
			{#if isLoading}
				<Skeleton class="h-6 w-36 rounded-full" />
				<Skeleton class="h-6 w-28 rounded-full" />
			{:else if accounts.length === 0}
				<span class="text-muted-foreground text-sm">
					<T keyName="my_tasks.connections.no_accounts" />
				</span>
			{:else}
				{#each accounts as account (account.id)}
					{@const status = getAccountStatus(account)}
					<Badge variant="outline" class="gap-1.5 py-1">
						<span class="inline-block h-2 w-2 rounded-full {getStatusDotColor(status)}"></span>
						{formatType(account.type)}: {account.name || formatType(account.type)}
					</Badge>
				{/each}
			{/if}
			<Button variant="ghost" size="sm" class="h-7 gap-1 px-2" onclick={handleConnect}>
				<PlusIcon class="h-3.5 w-3.5" />
				<T keyName="my_tasks.connections.connect" />
			</Button>
		{/if}
		<Badge variant="outline" class="ml-auto gap-1.5 py-1">
			<span class="inline-block h-2 w-2 rounded-full {sandboxStatus.color}"></span>
			<MonitorIcon class="h-3 w-3" />
			Sandbox: {sandboxStatus.label}
		</Badge>
	</div>

	<div>
		<KanbanBoard />
	</div>
</div>
