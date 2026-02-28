<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$lib/convex/_generated/api';
	import { getTranslate, T } from '@tolgee/svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import LinkIcon from '@lucide/svelte/icons/link';

	const { t } = getTranslate();
	const client = useConvexClient();
	const isEnabled = useQuery(api.unipile.isUnipileEnabled, {});

	async function handleClick() {
		try {
			const { url } = await client.action(api.unipile.getHostedAuthLink, {});
			window.open(url, '_blank');
		} catch {
			toast.error($t('app.sidebar.connect_accounts_error'));
		}
	}
</script>

{#if isEnabled.data?.enabled}
	<Sidebar.Group class="mt-auto">
		<Sidebar.GroupContent>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton>
						{#snippet child({ props })}
							<Button
								variant="ghost"
								class="w-full justify-start gap-2"
								onClickPromise={handleClick}
								{...props}
							>
								<LinkIcon />
								<span><T keyName="app.sidebar.connect_accounts" /></span>
							</Button>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.GroupContent>
	</Sidebar.Group>
{/if}
