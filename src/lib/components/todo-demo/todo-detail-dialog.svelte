<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { T, getTranslate } from '@tolgee/svelte';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import BotIcon from '@lucide/svelte/icons/bot';
	import type { TodoItem } from './types.js';

	let {
		task,
		open = $bindable(false),
		onSave,
		onDelete
	}: {
		task: TodoItem;
		open: boolean;
		onSave: (id: string, updates: { title: string; notes?: string }) => void;
		onDelete: (id: string) => void;
	} = $props();

	const { t } = getTranslate();

	let editTitle = $state('');
	let editNotes = $state('');

	$effect(() => {
		if (open) {
			editTitle = task.title;
			editNotes = task.notes ?? '';
		}
	});

	function handleSave() {
		const trimmedTitle = editTitle.trim();
		if (!trimmedTitle) return;
		onSave(task.id, {
			title: trimmedTitle,
			notes: editNotes.trim() || undefined
		});
		open = false;
	}

	function handleDelete() {
		onDelete(task.id);
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title><T keyName="todo_demo.detail.title" /></Dialog.Title>
			<Dialog.Description><T keyName="todo_demo.detail.description" /></Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 py-4">
			<div class="grid gap-2">
				<label for="todo-title" class="text-sm font-medium">
					<T keyName="todo_demo.detail.task_name" />
				</label>
				<Input id="todo-title" bind:value={editTitle} />
			</div>
			<div class="grid gap-2">
				<label for="todo-notes" class="text-sm font-medium">
					<T keyName="todo_demo.detail.notes" />
				</label>
				<Textarea
					id="todo-notes"
					bind:value={editNotes}
					placeholder={$t('todo_demo.detail.notes_placeholder')}
					rows={3}
				/>
			</div>
			{#if task.agentLogs}
				<div class="grid gap-2">
					<label for="todo-agent-logs" class="flex items-center gap-1.5 text-sm font-medium">
						<BotIcon class="size-3.5 text-muted-foreground" />
						<T keyName="todo_demo.detail.agent_logs" />
					</label>
					<Textarea
						id="todo-agent-logs"
						value={task.agentLogs}
						readonly
						rows={4}
						class="bg-muted/50 font-mono text-xs"
					/>
				</div>
			{/if}
		</div>
		<Dialog.Footer class="flex items-center justify-between sm:justify-between">
			<Button variant="destructive" size="sm" onclick={handleDelete}>
				<Trash2Icon class="mr-1.5 size-3.5" />
				<T keyName="todo_demo.detail.delete" />
			</Button>
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => (open = false)}>
					<T keyName="todo_demo.detail.cancel" />
				</Button>
				<Button onclick={handleSave} disabled={!editTitle.trim()}>
					<T keyName="todo_demo.detail.save" />
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
