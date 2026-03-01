<script lang="ts">
	import { T, getTranslate } from '@tolgee/svelte';
	import { useConvexClient } from 'convex-svelte';
	import { ChatRoot, ChatMessages, ChatInput, type ChatCoreAPI } from '$lib/chat';
	import type { useQuery } from 'convex-svelte';
	import { api } from '$lib/convex/_generated/api';
	import BotIcon from '@lucide/svelte/icons/bot';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';

	type ChatAPI = ChatCoreAPI & {
		listMessages: Parameters<typeof useQuery>[0];
	};

	let {
		threadId = $bindable<string | undefined>(undefined)
	}: {
		threadId?: string;
	} = $props();

	const { t } = getTranslate();
	const convexClient = useConvexClient();

	const chatApi: ChatAPI = {
		sendMessage: api.todo.messages.sendMessage,
		createThread: api.todo.threads.createThread,
		listMessages: api.todo.messages.listMessages
	};

	let activeThreadId = $derived(threadId ?? null);

	async function handleSend(prompt: string) {
		if (!activeThreadId) {
			const result = await convexClient.mutation(api.todo.threads.createThread, {
				taskTitle: 'Board Chat',
				taskColumn: 'todo'
			});
			threadId = result.threadId;
		}

		await convexClient.mutation(api.todo.messages.sendMessage, {
			threadId: threadId!,
			prompt
		});
	}
</script>

<div class="flex h-full flex-col overflow-hidden rounded-3xl bg-secondary">
	<!-- Header -->
	<div class="flex shrink-0 items-center gap-2 border-b border-border/50 p-4">
		<BotIcon class="size-4 text-muted-foreground" />
		<span class="text-sm font-semibold leading-tight"><T keyName="todo_demo.chat.title" /></span>
	</div>

	<!-- Chat area -->
	<ChatRoot threadId={activeThreadId} api={chatApi}>
		<div class="relative min-h-0 w-full flex-1">
			<ChatMessages>
				{#snippet emptyState()}
					<div class="flex h-full flex-col items-center justify-center p-6 text-center">
						<MessageSquareIcon class="mb-3 size-8 text-muted-foreground/50" />
						<p class="text-sm text-muted-foreground">
							<T keyName="todo_demo.chat.empty_state" />
						</p>
					</div>
				{/snippet}
			</ChatMessages>
		</div>

		<ChatInput
			placeholder={$t('todo_demo.chat.placeholder')}
			showFileButton={false}
			showCameraButton={false}
			showHandoffButton={false}
			class="mx-4 -translate-y-4 p-0"
			onSend={handleSend}
		/>
	</ChatRoot>
</div>
