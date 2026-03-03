import { createOpenAI } from '@ai-sdk/openai';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { internal } from '../_generated/api';
import { CODEX_API_ENDPOINT } from '../openai';

export function getSupportLanguageModel(): any {
	return openrouter('qwen/qwen3-vl-30b-a3b-thinking');
}

/**
 * Get the task agent language model for a specific user.
 * Uses the user's connected ChatGPT account (OAuth access token).
 * Throws if the user has not connected their OpenAI account.
 */
export async function getTaskLanguageModelForUser(
	ctx: { runAction: (fn: any, args: any) => Promise<any> },
	userId: string
): Promise<any> {
	const result = await ctx.runAction(internal.openai.getValidAccessToken, { userId });
	if (!result) {
		throw new Error(
			'OpenAI account not connected. Connect your ChatGPT account in Settings → Connections to use the task agent.'
		);
	}
	return getOpenAILanguageModel(result.accessToken, result.accountId, 'gpt-5.3-codex');
}

/**
 * Create an OpenAI language model that uses the ChatGPT Codex API endpoint.
 * Uses the user's OAuth access token (from their ChatGPT Plus/Pro subscription).
 */
export function getOpenAILanguageModel(
	accessToken: string,
	accountId?: string,
	modelId: string = 'gpt-5.3-codex'
): any {
	const openai = createOpenAI({
		apiKey: 'codex-oauth', // Placeholder — overridden by custom fetch
		fetch: async (input, init) => {
			const headers = new Headers(init?.headers);

			// Remove placeholder API key and set OAuth token
			headers.delete('authorization');
			headers.delete('Authorization');
			headers.set('Authorization', `Bearer ${accessToken}`);

			// Set ChatGPT account ID for org subscriptions
			if (accountId) {
				headers.set('ChatGPT-Account-Id', accountId);
			}

			// Rewrite URL to Codex endpoint
			const parsed =
				input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
			const isCodexRequest =
				parsed.pathname.includes('/v1/responses') || parsed.pathname.includes('/chat/completions');
			const url = isCodexRequest ? new URL(CODEX_API_ENDPOINT) : parsed;

			// Codex Responses API requires `instructions` field.
			// The AI SDK puts system prompts in `input` as role:"system" messages,
			// so extract them and set as `instructions` for the Codex endpoint.
			let body = init?.body;
			if (isCodexRequest && typeof body === 'string') {
				try {
					const json = JSON.parse(body);
					// Codex requires store=false
					json.store = false;
					if (Array.isArray(json.input)) {
						// Extract system/developer messages into `instructions` field
						if (!json.instructions) {
							const systemMessages: string[] = [];
							json.input = json.input.filter((item: Record<string, unknown>) => {
								if (item.role === 'system' || item.role === 'developer') {
									systemMessages.push(item.content as string);
									return false;
								}
								return true;
							});
							if (systemMessages.length > 0) {
								json.instructions = systemMessages.join('\n\n');
							}
						}
						// Strip item_reference entries — with store=false the API
						// cannot resolve references to items from previous responses.
						// The actual content (function_call, function_call_output) is
						// already present inline in the input array.
						json.input = json.input.filter(
							(item: Record<string, unknown>) => item.type !== 'item_reference'
						);
					}
					body = JSON.stringify(json);
				} catch {
					// If parsing fails, send as-is
				}
			}

			return fetch(url, { ...init, body, headers });
		}
	});

	return openai.responses(modelId);
}
