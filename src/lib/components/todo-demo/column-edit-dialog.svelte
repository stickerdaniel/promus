<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Input from '$lib/components/ui/input/input.svelte';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { T, getTranslate } from '@tolgee/svelte';
	import type { ColumnMeta } from './types.js';

	let {
		columnId,
		columnMeta,
		defaultTitle,
		open = $bindable(false),
		onSave
	}: {
		columnId: string;
		columnMeta?: ColumnMeta;
		defaultTitle: string;
		open: boolean;
		onSave: (columnId: string, updates: { name?: string; instructions?: string }) => void;
	} = $props();

	const { t } = getTranslate();

	let editName = $state('');
	let editInstructions = $state('');
	let initialColumnId = $state('');

	$effect(() => {
		if (open && columnId !== initialColumnId) {
			initialColumnId = columnId;
			editName = columnMeta?.name ?? '';
			editInstructions = columnMeta?.instructions ?? '';
		}
		if (!open) {
			initialColumnId = '';
		}
	});

	function handleSave() {
		onSave(columnId, {
			name: editName.trim() || undefined,
			instructions: editInstructions.trim() || undefined
		});
		open = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) {
			e.preventDefault();
			handleSave();
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md" onkeydown={handleKeydown}>
		<Dialog.Header>
			<Dialog.Title><T keyName="todo_demo.column_edit.title" /></Dialog.Title>
			<Dialog.Description><T keyName="todo_demo.column_edit.description" /></Dialog.Description>
		</Dialog.Header>
		<Field.Group>
			<Field.Field>
				<Field.Label><T keyName="todo_demo.column_edit.name_label" /></Field.Label>
				<Input bind:value={editName} placeholder={defaultTitle} />
				<Field.Description>
					<T keyName="todo_demo.column_edit.name_description" />
				</Field.Description>
			</Field.Field>
			<Field.Field>
				<Field.Label><T keyName="todo_demo.column_edit.instructions_label" /></Field.Label>
				<Textarea
					bind:value={editInstructions}
					placeholder={$t('todo_demo.column_edit.instructions_placeholder')}
					rows={4}
				/>
				<Field.Description>
					<T keyName="todo_demo.column_edit.instructions_description" />
				</Field.Description>
			</Field.Field>
		</Field.Group>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>
				<T keyName="todo_demo.detail.cancel" />
			</Button>
			<Button onclick={handleSave}>
				<T keyName="todo_demo.detail.save" />
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
