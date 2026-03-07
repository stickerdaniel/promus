<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { T, getTranslate } from '@tolgee/svelte';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import Markdown from '$lib/components/prompt-kit/markdown/Markdown.svelte';
	import Logo from '$lib/components/icons/logo.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { cmdOrCtrl } from '$lib/hooks/is-mac.svelte.js';
	import { tick } from 'svelte';
	import type { TodoItem } from './types.js';
	import TaskSpecRenderer from './render/TaskSpecRenderer.svelte';
	import type { Spec } from '@json-render/core';

	let {
		task,
		open = $bindable(false),
		onSave,
		onDelete,
		onApprove,
		onReject,
		onBlockAction,
		onRetry
	}: {
		task: TodoItem;
		open: boolean;
		onSave: (id: string, updates: { title: string; notes?: string }) => void;
		onDelete: (id: string) => void;
		onApprove?: (id: string) => void;
		onReject?: (id: string, feedback: string) => void;
		onBlockAction?: (taskId: string, threadId: string, action: string) => void;
		onRetry?: (id: string) => void;
	} = $props();

	let parsedSpec: Spec | null = $derived.by(() => {
		if (!task.agentSpec) return null;
		try {
			return JSON.parse(task.agentSpec) as Spec;
		} catch {
			return null;
		}
	});

	const { t } = getTranslate();

	let editTitle = $state('');
	let editNotes = $state('');
	let editingNotes = $state(false);
	let notesDirty = $state(false);
	let rejectFeedback = $state('');
	let initialTaskId = $state('');

	// Reset editable fields when opening a task (or reopening the same one)
	$effect(() => {
		if (open && task.id !== initialTaskId) {
			initialTaskId = task.id;
			editTitle = task.title;
			editNotes = task.notes ?? '';
			editingNotes = false;
			notesDirty = false;
			rejectFeedback = '';
		}
		if (!open) {
			initialTaskId = '';
		}
	});

	// Keep notes in sync with live backend updates (agent writes)
	// but only when user is not actively editing
	$effect(() => {
		if (open && !editingNotes && !notesDirty) {
			const liveNotes = task.notes ?? '';
			if (liveNotes !== editNotes) {
				editNotes = liveNotes;
			}
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

	function handleDialogKeydown(e: KeyboardEvent) {
		const mod = e.metaKey || e.ctrlKey;
		if (!mod) return;

		if (e.key === 's') {
			e.preventDefault();
			handleSave();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			handleSave();
		} else if (e.key === 'e' && editNotes) {
			e.preventDefault();
			editingNotes = !editingNotes;
		}
	}

	function handleTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSave();
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class={parsedSpec ? 'sm:max-w-2xl' : 'sm:max-w-md'}
		onkeydown={handleDialogKeydown}
	>
		<Dialog.Header>
			<Dialog.Title><T keyName="todo_demo.detail.title" /></Dialog.Title>
			<Dialog.Description><T keyName="todo_demo.detail.description" /></Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 py-4">
			<div class="grid gap-2">
				<label for="todo-title" class="text-sm font-medium">
					<T keyName="todo_demo.detail.task_name" />
				</label>
				<Input id="todo-title" bind:value={editTitle} onkeydown={handleTitleKeydown} />
			</div>
			<div class="grid gap-2">
				<label for="todo-notes" class="text-sm font-medium">
					<T keyName="todo_demo.detail.notes" />
				</label>
				{#if editingNotes || !editNotes}
					<Textarea
						id="todo-notes"
						bind:value={editNotes}
						placeholder={$t('todo_demo.detail.notes_placeholder')}
						rows={3}
						onfocus={() => {
							editingNotes = true;
						}}
						oninput={() => {
							notesDirty = true;
						}}
						onblur={async () => {
							if (!editNotes) return;
							editingNotes = false;
							await tick();
							document.getElementById('todo-notes-preview')?.focus();
						}}
					/>
				{:else}
					<div
						id="todo-notes-preview"
						class="max-h-60 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm"
						role="button"
						tabindex="0"
						onkeydown={async (e) => {
							if (e.key !== 'Enter') return;
							e.preventDefault();
							editingNotes = true;
							await tick();
							const el = document.getElementById('todo-notes') as HTMLTextAreaElement | null;
							if (el) {
								el.focus();
								el.selectionStart = el.selectionEnd = el.value.length;
							}
						}}
						ondblclick={async (e) => {
							const target = e.currentTarget as HTMLElement;
							const sel = window.getSelection();
							let rawOffset = editNotes.length;

							if (sel && sel.rangeCount > 0) {
								const range = sel.getRangeAt(0);
								const preRange = document.createRange();
								preRange.selectNodeContents(target);
								preRange.setEnd(range.startContainer, range.startOffset);
								const textBefore = preRange.toString();

								let found = false;
								for (let len = Math.min(30, textBefore.length); len >= 3; len--) {
									const needle = textBefore.slice(-len);
									const idx = editNotes.indexOf(needle);
									if (idx !== -1) {
										rawOffset = idx + needle.length;
										found = true;
										break;
									}
								}

								if (!found) {
									const total = (target.textContent ?? '').length;
									const ratio = total > 0 ? textBefore.length / total : 1;
									rawOffset = Math.round(ratio * editNotes.length);
								}
							}

							editingNotes = true;
							await tick();
							const el = document.getElementById('todo-notes') as HTMLTextAreaElement | null;
							if (el) {
								el.focus();
								el.selectionStart = el.selectionEnd = Math.min(rawOffset, el.value.length);
							}
						}}
					>
						<Markdown content={editNotes} class="prose-sm" />
					</div>
				{/if}
			</div>
		</div>

		{#if parsedSpec}
			<div class="max-h-80 overflow-y-auto rounded-md border bg-muted/30 p-3">
				<TaskSpecRenderer
					spec={parsedSpec}
					onStateChange={(changes) => {
						if (task.threadId && onBlockAction) {
							const actionChange = changes.find((c) => c.path.includes('pendingAction'));
							if (actionChange) {
								onBlockAction(task.id, task.threadId, String(actionChange.value));
							}
						}
					}}
				/>
			</div>
		{/if}

		{#if task.agentStatus === 'working'}
			<div class="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
				<Logo class="size-4 agent-working text-primary" />
				<span class="text-sm text-muted-foreground">Coda is working...</span>
			</div>
		{:else if task.agentStatus === 'done' && task.agentSummary}
			<div class="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2">
				<Logo class="mt-0.5 size-4 shrink-0 text-primary" />
				<Markdown content={task.agentSummary} class="prose-sm text-sm text-muted-foreground" />
			</div>
		{:else if task.agentStatus === 'error'}
			<div
				class="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
			>
				<TriangleAlertIcon class="mt-0.5 size-4 shrink-0 text-destructive" />
				<div class="flex flex-1 items-start justify-between gap-2">
					<span class="text-sm text-destructive"
						>{task.agentSummary || 'Coda encountered an error.'}</span
					>
					{#if onRetry}
						<Button variant="outline" size="sm" class="shrink-0" onclick={() => onRetry(task.id)}>
							<RotateCcwIcon class="mr-1.5 size-3.5" />
							Retry
						</Button>
					{/if}
				</div>
			</div>
		{:else if task.agentStatus === 'awaiting_approval'}
			<div class="grid gap-3">
				<Separator />
				<div class="flex items-center gap-2">
					<Logo class="size-4 text-primary" />
					<span class="text-sm font-medium">Coda needs approval</span>
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

		<Dialog.Footer class="flex-row items-center justify-between">
			<Button variant="destructive" size="sm" onclick={handleDelete}>
				<Trash2Icon class="mr-1.5 size-3.5" />
				<T keyName="todo_demo.detail.delete" />
			</Button>
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => (open = false)}>
					<T keyName="todo_demo.detail.cancel" />
					<kbd class="ml-1.5 text-[10px] opacity-60">Esc</kbd>
				</Button>
				<Button onclick={handleSave} disabled={!editTitle.trim()}>
					<T keyName="todo_demo.detail.save" />
					<kbd class="ml-1.5 text-[10px] opacity-60">{cmdOrCtrl}S</kbd>
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
