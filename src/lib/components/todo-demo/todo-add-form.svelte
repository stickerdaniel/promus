<script lang="ts">
	import { getTranslate } from '@tolgee/svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';

	let { onAdd }: { onAdd: (title: string) => void | Promise<void> } = $props();

	const { t } = getTranslate();

	let title = $state('');
	let editing = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = title.trim();
		if (!trimmed) return;
		// Optimistically close the input immediately for snappier UX.
		title = '';
		editing = false;
		try {
			await onAdd(trimmed);
		} catch {
			// Restore input only if caller throws unexpectedly.
			title = trimmed;
			editing = true;
		}
	}

	function cancel() {
		title = '';
		editing = false;
	}
</script>

{#if editing}
	<form onsubmit={handleSubmit} class="grid gap-2 pt-2">
		<Input
			bind:value={title}
			placeholder={$t('todo_demo.add_placeholder')}
			class="h-8 text-sm"
			autofocus
		/>
		<div class="flex gap-2">
			<Button type="submit" size="sm" class="h-7 text-xs">
				{$t('todo_demo.add_card')}
			</Button>
			<Button type="button" variant="ghost" size="icon" class="size-7" onclick={cancel}>
				<XIcon class="size-4" />
			</Button>
		</div>
	</form>
{:else}
	<button
		class="mt-2 flex w-full items-center rounded-lg px-2 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted/70 hover:text-foreground dark:text-foreground/75 dark:hover:bg-background"
		onclick={() => (editing = true)}
	>
		<span class="flex items-center gap-1">
			<PlusIcon class="size-4" />
			{$t('todo_demo.add_card')}
		</span>
	</button>
{/if}
