<script lang="ts">
	import {
		DragDropProvider,
		DragOverlay,
		KeyboardSensor,
		PointerSensor
	} from '@dnd-kit-svelte/svelte';
	import { RestrictToWindowEdges } from '@dnd-kit-svelte/svelte/modifiers';
	import { move } from '@dnd-kit/helpers';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { toast } from 'svelte-sonner';
	import { getTranslate } from '@tolgee/svelte';
	import BugIcon from '@lucide/svelte/icons/bug';
	import { api } from '$lib/convex/_generated/api';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { KanbanData, ColumnId, TodoItem } from './types.js';
	import KanbanColumn from './kanban-column.svelte';
	import KanbanItem from './kanban-item.svelte';
	import TodoDetailDialog from './todo-detail-dialog.svelte';

	const { t } = getTranslate();
	const convexClient = useConvexClient();

	const sensors = [PointerSensor, KeyboardSensor];
	const columnIds: ColumnId[] = ['todo', 'in-progress', 'done'];
	const boardQuery = useQuery(api.todos.getBoard, {});

	let items: KanbanData = $state({
		todo: [],
		'in-progress': [],
		done: []
	});
	let overlayTilted = $state(false);
	let isDragging = $state(false);
	let pendingSaveCount = $state(0);
	let dragStartSnapshot = $state<KanbanData | null>(null);
	let selectedTask = $state<TodoItem | null>(null);
	let dialogOpen = $state(false);
	let debugOpen = $state(false);

	type SyncEvent = {
		operation: { source?: { type?: unknown } | null; target?: unknown | null };
	};

	type EndEvent = SyncEvent & {
		suspend: () => { resume: () => void };
	};

	function cloneBoard(board: KanbanData): KanbanData {
		return {
			todo: board.todo.map((t) => ({ ...t })),
			'in-progress': board['in-progress'].map((t) => ({ ...t })),
			done: board.done.map((t) => ({ ...t }))
		};
	}

	function isSameBoard(a: KanbanData, b: KanbanData): boolean {
		for (const columnId of columnIds) {
			if (a[columnId].length !== b[columnId].length) {
				return false;
			}
			for (const [index, task] of a[columnId].entries()) {
				const other = b[columnId][index];
				if (!other || other.id !== task.id || other.title !== task.title) {
					return false;
				}
			}
		}
		return true;
	}

	function createTaskId(): string {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID();
		}
		return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	$effect(() => {
		if (!boardQuery.data || isDragging || pendingSaveCount > 0) return;
		items = cloneBoard(boardQuery.data);
	});

	function syncItemOrder(event: SyncEvent) {
		const { source, target } = event.operation;
		if (!source || !target || source.type === 'column') return;

		items = move(items, event as any) as KanbanData;
	}

	async function persistBoard(nextBoard: KanbanData, rollbackBoard: KanbanData): Promise<void> {
		const nextSnapshot = cloneBoard(nextBoard);
		const rollbackSnapshot = cloneBoard(rollbackBoard);
		pendingSaveCount += 1;

		try {
			await convexClient.mutation(
				api.todos.saveBoard,
				{ board: nextSnapshot },
				{
					optimisticUpdate: (store) => {
						store.setQuery(api.todos.getBoard, {}, nextSnapshot);
					}
				}
			);
		} catch (error) {
			console.error('[kanban] Failed to save board:', error);
			items = rollbackSnapshot;
			toast.error($t('todo_demo.save_failed'));
		} finally {
			pendingSaveCount = Math.max(0, pendingSaveCount - 1);
		}
	}

	async function addTodo(columnId: ColumnId, title: string): Promise<void> {
		const trimmed = title.trim();
		if (!trimmed) return;

		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		nextBoard[columnId] = [
			...nextBoard[columnId],
			{
				id: createTaskId(),
				title: trimmed
			}
		];
		items = nextBoard;
		await persistBoard(nextBoard, rollbackBoard);
	}

	function handleTaskClick(task: TodoItem) {
		selectedTask = { ...task };
		dialogOpen = true;
	}

	async function handleTaskSave(id: string, updates: { title: string; notes?: string }) {
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		for (const colId of columnIds) {
			const idx = nextBoard[colId].findIndex((t) => t.id === id);
			if (idx !== -1) {
				nextBoard[colId][idx] = { ...nextBoard[colId][idx], ...updates };
				break;
			}
		}
		items = nextBoard;
		await persistBoard(nextBoard, rollbackBoard);
	}

	async function handleTaskDelete(id: string) {
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		for (const colId of columnIds) {
			nextBoard[colId] = nextBoard[colId].filter((t) => t.id !== id);
		}
		items = nextBoard;
		await persistBoard(nextBoard, rollbackBoard);
	}

	async function handleAgentApprove(id: string) {
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		for (const colId of columnIds) {
			const idx = nextBoard[colId].findIndex((t) => t.id === id);
			if (idx !== -1) {
				const { agentDraft: _, ...rest } = nextBoard[colId][idx];
				nextBoard[colId][idx] = { ...rest, agentStatus: 'done' };
				break;
			}
		}
		items = nextBoard;
		await persistBoard(nextBoard, rollbackBoard);
	}

	async function handleAgentReject(id: string, feedback: string) {
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		for (const colId of columnIds) {
			const idx = nextBoard[colId].findIndex((t) => t.id === id);
			if (idx !== -1) {
				const { agentDraft: _, ...rest } = nextBoard[colId][idx];
				nextBoard[colId][idx] = {
					...rest,
					agentStatus: 'working',
					...(feedback ? { agentSummary: feedback } : {})
				};
				break;
			}
		}
		items = nextBoard;
		await persistBoard(nextBoard, rollbackBoard);
	}

	async function handleDragEnd(event: EndEvent): Promise<void> {
		syncItemOrder(event);
		overlayTilted = false;
		isDragging = false;

		// Let overlay re-render without tilt before drop animation snapshot is taken.
		const suspended = event.suspend();
		requestAnimationFrame(() => suspended.resume());

		const startBoard = dragStartSnapshot;
		dragStartSnapshot = null;
		if (!startBoard) return;

		const nextBoard = cloneBoard(items);
		if (isSameBoard(startBoard, nextBoard)) return;

		await persistBoard(nextBoard, startBoard);
	}

	// Debug helpers — add mock tasks with agent state
	function debugAddMockTask(task: TodoItem, columnId: ColumnId = 'in-progress') {
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		nextBoard[columnId] = [...nextBoard[columnId], task];
		items = nextBoard;
		void persistBoard(nextBoard, rollbackBoard);
	}

	function debugClearMockTasks() {
		const rollbackBoard = cloneBoard(items);
		const nextBoard = cloneBoard(items);
		for (const colId of columnIds) {
			nextBoard[colId] = nextBoard[colId].filter((t) => !t.id.startsWith('debug-'));
		}
		items = nextBoard;
		void persistBoard(nextBoard, rollbackBoard);
	}
</script>

<DragDropProvider
	{sensors}
	modifiers={[RestrictToWindowEdges]}
	onDragStart={() => {
		dragStartSnapshot = cloneBoard(items);
		overlayTilted = true;
		isDragging = true;
	}}
	onDragEnd={(event) => {
		void handleDragEnd(event as EndEvent);
	}}
	onDragOver={syncItemOrder}
>
	<div class="grid items-start gap-3 md:grid-cols-3">
		{#each columnIds as columnId, colIdx (columnId)}
			<KanbanColumn
				id={columnId}
				title={$t(`todo_demo.column.${columnId}`)}
				index={colIdx}
				onAdd={(title) => addTodo(columnId, title)}
			>
				{#each items[columnId] as task, taskIdx (task.id)}
					<KanbanItem
						{task}
						index={taskIdx}
						group={columnId}
						data={{ group: columnId }}
						onclick={handleTaskClick}
					/>
				{/each}
			</KanbanColumn>
		{/each}
	</div>

	<DragOverlay>
		{#snippet children(source)}
			{#if source.data.group}
				{@const task = items[source.data.group as ColumnId]?.find((t) => t.id === source.id)}
				{#if task}
					<KanbanItem {task} index={0} isOverlay {overlayTilted} />
				{/if}
			{:else}
				{@const colId = source.id as ColumnId}
				<KanbanColumn
					id={colId}
					title={$t(`todo_demo.column.${colId}`)}
					index={0}
					isOverlay
					{overlayTilted}
					onAdd={() => {}}
				>
					{#each items[colId] as task, taskIdx (task.id)}
						<KanbanItem {task} index={taskIdx} group={colId} data={{ group: colId }} />
					{/each}
				</KanbanColumn>
			{/if}
		{/snippet}
	</DragOverlay>
</DragDropProvider>

{#if selectedTask}
	<TodoDetailDialog
		task={selectedTask}
		bind:open={dialogOpen}
		onSave={handleTaskSave}
		onDelete={handleTaskDelete}
		onApprove={handleAgentApprove}
		onReject={handleAgentReject}
	/>
{/if}

{#if import.meta.env.DEV}
	<div class="mt-3">
		<Button variant="ghost" size="sm" onclick={() => (debugOpen = !debugOpen)}>
			<BugIcon class="mr-1.5 size-3.5" />
			Debug Agent
		</Button>
		{#if debugOpen}
			<div
				class="mt-2 flex flex-wrap gap-2 rounded-lg border border-dashed border-muted-foreground/30 p-3"
			>
				<Button
					variant="outline"
					size="sm"
					onclick={() =>
						debugAddMockTask({
							id: `debug-working-${Date.now()}`,
							title: 'Find a restaurant for Saturday',
							agentStatus: 'working'
						})}
				>
					+ Working
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={() =>
						debugAddMockTask({
							id: `debug-done-research-${Date.now()}`,
							title: 'Research conference speakers',
							agentStatus: 'done',
							agentSummary: 'Found 5 speakers matching your criteria',
							agentDraft:
								'1. Anna Lee — AI Ethics researcher at Stanford, 1.2k LinkedIn connections\n2. Tom Zhang — ML Ops lead at Databricks, speaker at NeurIPS 2025\n3. Sara Kim — NLP team at Google DeepMind, 800+ connections\n4. Dev Patel — Computer Vision at Meta, co-authored 12 papers\n5. Lisa Chen — Reinforcement Learning at OpenAI, keynote at ICML',
							agentDraftType: 'research'
						})}
				>
					+ Done (Research)
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={() =>
						debugAddMockTask({
							id: `debug-done-msg-${Date.now()}`,
							title: 'Cancel gym membership',
							agentStatus: 'done',
							agentSummary: 'Cancellation email sent — membership ends March 31',
							agentDraft:
								'Subject: Membership Cancellation Request\n\nDear FitLife Team,\n\nI would like to cancel my gym membership (ID: FL-28491) effective at the end of the current billing cycle.\n\nPlease confirm the cancellation and final billing date.\n\nThank you,\nFadi',
							agentDraftType: 'email'
						})}
				>
					+ Done (Email sent)
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={() =>
						debugAddMockTask({
							id: `debug-approval-msg-${Date.now()}`,
							title: 'Follow up with Marc about the proposal',
							agentStatus: 'awaiting_approval',
							agentSummary: 'Draft follow-up message ready for Marc',
							agentDraft:
								"Hi Marc,\n\nJust following up on our conversation about the proposal. I wanted to check if you had a chance to review the latest version and if there are any changes you'd like to discuss.\n\nLooking forward to hearing from you!\n\nBest regards",
							agentDraftType: 'message'
						})}
				>
					+ Awaiting (Message)
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={() =>
						debugAddMockTask({
							id: `debug-approval-email-${Date.now()}`,
							title: 'Send booking confirmation to Sarah',
							agentStatus: 'awaiting_approval',
							agentSummary: 'Booking confirmation email drafted for Sarah',
							agentDraft:
								"Hi Sarah,\n\nThis is to confirm our meeting on Thursday at 2 PM at the Riverside Café.\n\nI've reserved a table for two under my name. Please let me know if you need to reschedule.\n\nSee you there!",
							agentDraftType: 'email'
						})}
				>
					+ Awaiting (Email)
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={() =>
						debugAddMockTask(
							{
								id: `debug-plain-${Date.now()}`,
								title: 'Book flights to Berlin',
								notes: 'Check Lufthansa and EasyJet for March dates'
							},
							'todo'
						)}
				>
					+ Plain task
				</Button>
				<Button variant="destructive" size="sm" onclick={debugClearMockTasks}>
					Clear debug tasks
				</Button>
			</div>
		{/if}
	</div>
{/if}
