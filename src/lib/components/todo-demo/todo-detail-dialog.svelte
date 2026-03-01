<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { T, getTranslate } from '@tolgee/svelte';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import Markdown from '$lib/components/prompt-kit/markdown/Markdown.svelte';
	import Logo from '$lib/components/icons/logo.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import type { TodoItem } from './types.js';

	let {
		task,
		open = $bindable(false),
		onSave,
		onDelete,
		onApprove,
		onReject
	}: {
		task: TodoItem;
		open: boolean;
		onSave: (id: string, updates: { title: string; notes?: string }) => void;
		onDelete: (id: string) => void;
		onApprove?: (id: string) => void;
		onReject?: (id: string, feedback: string) => void;
	} = $props();

	const { t } = getTranslate();

	let editTitle = $state('');
	let editNotes = $state('');
	let editingNotes = $state(false);
	let rejectFeedback = $state('');

	$effect(() => {
		if (open) {
			editTitle = task.title;
			editNotes = task.notes ?? '';
			editingNotes = false;
			rejectFeedback = '';
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
				<div class="flex items-center justify-between">
					<label for="todo-notes" class="text-sm font-medium">
						<T keyName="todo_demo.detail.notes" />
					</label>
					{#if editNotes}
						<Button
							variant="ghost"
							size="sm"
							class="h-6 gap-1 px-2 text-xs text-muted-foreground"
							onclick={() => (editingNotes = !editingNotes)}
						>
							{#if editingNotes}
								<EyeIcon class="size-3" />
								Preview
							{:else}
								<PencilIcon class="size-3" />
								Edit
							{/if}
						</Button>
					{/if}
				</div>
				{#if editingNotes || !editNotes}
					<Textarea
						id="todo-notes"
						bind:value={editNotes}
						placeholder={$t('todo_demo.detail.notes_placeholder')}
						rows={3}
					/>
				{:else}
					<div
						class="max-h-60 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm"
						role="button"
						tabindex="0"
						ondblclick={() => (editingNotes = true)}
					>
						<Markdown content={editNotes} class="prose-sm" />
					</div>
				{/if}
			</div>
		</div>

		{#if task.agentStatus === 'working'}
			<div class="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
				<Logo class="size-4 text-primary agent-working" />
				<span class="text-sm text-muted-foreground">Agent is working...</span>
			</div>
		{:else if task.agentStatus === 'done' && task.agentSummary}
			<div class="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
				<Logo class="size-4 text-primary" />
				<span class="text-sm text-muted-foreground">{task.agentSummary}</span>
			</div>
		{:else if task.agentStatus === 'awaiting_approval'}
			<div class="grid gap-3">
				<Separator />
				<div class="flex items-center gap-2">
					<Logo class="size-4 text-primary" />
					<span class="text-sm font-medium">Agent needs approval</span>
				</div>
				{#if task.agentDraft}
					<div class="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
						<Markdown content={task.agentDraft} class="prose-sm" />
					</div>
				{/if}
				<Textarea
					bind:value={rejectFeedback}
					placeholder="Feedback (required to reject)"
					rows={2}
				/>
				<div class="flex gap-2">
					<Button variant="default" size="sm" onclick={() => onApprove?.(task.id)}>
						<CheckIcon class="mr-1.5 size-3.5" />
						Approve
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={!rejectFeedback.trim()}
						onclick={() => onReject?.(task.id, rejectFeedback.trim())}
					>
						<XIcon class="mr-1.5 size-3.5" />
						Reject
					</Button>
				</div>
			</div>
		{/if}

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
