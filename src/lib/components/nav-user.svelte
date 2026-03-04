<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import { T, getTranslate } from '@tolgee/svelte';
	import { localizedHref } from '$lib/utils/i18n';
	import { toast } from 'svelte-sonner';

	const { t } = getTranslate();

	interface Props {
		user: { name: string; email: string; avatar: string };
		isImpersonating?: boolean;
	}

	let { user, isImpersonating = false }: Props = $props();

	async function signOut() {
		const result = await authClient.signOut();
		if (result.error) {
			console.error('Sign out error:', result.error);
		} else {
			await goto(resolve(localizedHref('/')));
		}
	}

	async function stopImpersonating() {
		try {
			const result = await authClient.admin.stopImpersonating();
			if (result.error) {
				toast.error($t('app.user_menu.impersonation_stop_failed'));
				return;
			}
			toast.success($t('app.user_menu.impersonation_stopped'));
			goto(resolve(localizedHref('/admin/users')));
		} catch {
			toast.error($t('app.user_menu.impersonation_stop_failed'));
		}
	}
</script>

{#if isImpersonating}
	<div
		class="bg-warning/10 text-warning border-warning/20 mb-2 rounded-md border px-3 py-2 text-xs font-medium"
	>
		<T keyName="app.user_menu.impersonating_banner" />
	</div>
{/if}
<Sidebar.Menu>
	<Sidebar.MenuItem>
		<Sidebar.MenuButton>
			{#snippet child({ props })}
				<a href={resolve(localizedHref('/app/settings'))} {...props}>
					<SettingsIcon />
					<span><T keyName="app.user_menu.settings" /></span>
				</a>
			{/snippet}
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
	<Sidebar.MenuItem>
		<div class="flex h-12 items-center gap-2 px-1 py-2 text-sm">
			<Avatar.Root class="size-8 rounded-lg">
				<Avatar.Image src={user.avatar} alt={user.name} />
				<Avatar.Fallback class="rounded-lg">CN</Avatar.Fallback>
			</Avatar.Root>
			<div class="grid flex-1 text-left text-sm leading-tight">
				<span class="truncate font-medium">{user.name}</span>
				<span class="truncate text-xs text-muted-foreground">{user.email}</span>
			</div>
			<button
				onclick={() => signOut()}
				class="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
				data-testid="logout-button"
			>
				<LogOutIcon class="size-4" />
				<span class="sr-only"><T keyName="app.user_menu.logout" /></span>
			</button>
		</div>
	</Sidebar.MenuItem>
	{#if isImpersonating}
		<Sidebar.MenuItem>
			<Sidebar.MenuButton onclick={() => stopImpersonating()} class="text-warning pl-4">
				<UserXIcon />
				<span><T keyName="app.user_menu.stop_impersonating" /></span>
			</Sidebar.MenuButton>
		</Sidebar.MenuItem>
	{/if}
</Sidebar.Menu>
