<script lang="ts">
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import { getTranslate } from '@tolgee/svelte';
	import type { SandboxStatus } from '$lib/server/sandbox/types';

	const { t } = getTranslate();

	let { status }: { status: SandboxStatus } = $props();

	const config = $derived(
		{
			creating: { variant: 'secondary' as const, dotClass: 'bg-yellow-500 animate-pulse' },
			ready: { variant: 'default' as const, dotClass: 'bg-green-500' },
			stopped: { variant: 'outline' as const, dotClass: 'bg-gray-400' },
			error: { variant: 'destructive' as const, dotClass: 'bg-red-500' },
			deleted: { variant: 'outline' as const, dotClass: 'bg-gray-400' }
		}[status]
	);

	const labelKey = $derived(`sandbox.status.${status}`);
</script>

<Badge variant={config.variant} class="gap-1.5">
	<span class="size-2 rounded-full {config.dotClass}"></span>
	{$t(labelKey)}
</Badge>
