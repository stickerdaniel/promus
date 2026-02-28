<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import ChatInput from '$lib/chat/ui/ChatInput.svelte';
	import { getChatUIContext } from '$lib/chat/ui/ChatContext.svelte.js';
	import { getTranslate } from '@tolgee/svelte';

	const { t } = getTranslate();
	const ctx = getChatUIContext();
	const client = useConvexClient();

	async function handleSend(prompt: string) {
		if (!prompt?.trim()) return;
		if (ctx.isProcessing) return;

		try {
			await ctx.core.sendMessage(client, prompt);
		} catch (error) {
			console.error('[SandboxChatInput] Failed to send:', error);
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
