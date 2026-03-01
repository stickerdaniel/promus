<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import ChatInput from '$lib/chat/ui/ChatInput.svelte';
	import { getChatUIContext } from '$lib/chat/ui/ChatContext.svelte.js';
	import { getTranslate } from '@tolgee/svelte';

	const { t } = getTranslate();
	const ctx = getChatUIContext();
	const client = useConvexClient();

	let isRunning = $state(false);

	async function handleSend(prompt: string) {
		if (!prompt?.trim()) return;
		if (isRunning) return;

		isRunning = true;
		try {
			// 1. Save user message to Convex (with optimistic update)
			await ctx.core.sendMessage(client, prompt);

			// 2. Execute vibe in sandbox and save assistant response
			const threadId = ctx.core.threadId;
			if (!threadId) return;

			const res = await fetch('/api/sandbox/run', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ threadId, prompt: prompt.trim() })
			});

			if (!res.ok) {
				const text = await res.text();
				console.error('[SandboxChatInput] Vibe execution failed:', text);
			}
		} catch (error) {
			console.error('[SandboxChatInput] Failed to send:', error);
		} finally {
			isRunning = false;
			// Clear awaiting state — sandbox messages are saved directly, not streamed
			ctx.core.setAwaitingStream(false);
			ctx.core.setSending(false);
		}
	}
</script>

<ChatInput
	placeholder={$t('sandbox.input_placeholder')}
	showFileButton={false}
	showHandoffButton={false}
	showCameraButton={false}
	onSend={handleSend}
/>
