<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { T, getTranslate } from '@tolgee/svelte';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import SendIcon from '@lucide/svelte/icons/send';
	import ThumbsDownIcon from '@lucide/svelte/icons/thumbs-down';
	import BotIcon from '@lucide/svelte/icons/bot';
	import Logo from '$lib/components/icons/logo.svelte';
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
	let rejectFeedback = $state('');
	let showFeedback = $state(false);

	$effect(() => {
		if (open) {
			editTitle = task.title;
			editNotes = task.notes ?? '';
			rejectFeedback = '';
			showFeedback = false;
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

	function handleApprove() {
		onApprove?.(task.id);
		open = false;
	}

	function handleReject() {
		if (!showFeedback) {
			showFeedback = true;
			return;
		}
		onReject?.(task.id, rejectFeedback.trim());
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

			{#if task.agentStatus === 'awaiting_approval' && task.agentDraft}
				<div class="grid gap-3 rounded-lg border border-primary/20 bg-primary/3 p-3">
					<div class="flex items-center gap-2">
						<Logo class="size-4 agent-done" style="--logo-color: var(--primary)" />
						<span class="text-sm font-medium">
							<T keyName="todo_demo.detail.agent_draft_title" />
						</span>
					</div>
					{#if task.agentSummary}
						<p class="text-xs text-muted-foreground">{task.agentSummary}</p>
					{/if}
					<div class="rounded-md border bg-card p-3 text-sm whitespace-pre-wrap">
						{task.agentDraft}
					</div>
					<div class="flex gap-2">
						<Button size="sm" onclick={handleApprove}>
							<SendIcon class="mr-1.5 size-3.5" />
							<T keyName="todo_demo.detail.agent_send" />
						</Button>
						<Button variant="outline" size="sm" onclick={handleReject}>
							<ThumbsDownIcon class="mr-1.5 size-3.5" />
							{#if showFeedback}
								<T keyName="todo_demo.detail.agent_submit_feedback" />
							{:else}
								<T keyName="todo_demo.detail.agent_reject" />
							{/if}
						</Button>
					</div>
					{#if showFeedback}
						<Textarea
							bind:value={rejectFeedback}
							placeholder={$t('todo_demo.detail.agent_feedback_placeholder')}
							rows={2}
						/>
					{/if}
				</div>
			{:else if task.agentStatus === 'done' && (task.agentSummary || task.agentDraft)}
				<div class="grid gap-2 rounded-lg border bg-muted/30 p-3">
					<div class="flex items-center gap-2">
						<Logo class="size-4" style="--logo-color: var(--primary)" />
						<span class="text-sm font-medium">
							<T keyName="todo_demo.detail.agent_status_done" />
						</span>
					</div>
					{#if task.agentSummary}
						<p class="text-xs text-muted-foreground">{task.agentSummary}</p>
					{/if}
					{#if task.agentDraft}
						<div class="rounded-md border bg-card p-3 text-sm whitespace-pre-wrap">
							{task.agentDraft}
						</div>
					{/if}
				</div>
			{:else if task.agentStatus === 'working'}
				<div class="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
					<Logo class="size-4 agent-working" style="--logo-color: var(--primary)" />
					<span class="text-sm text-muted-foreground">
						<T keyName="todo_demo.detail.agent_status_working" />
					</span>
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
