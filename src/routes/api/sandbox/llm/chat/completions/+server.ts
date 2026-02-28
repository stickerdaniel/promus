import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import {
	BedrockRuntimeClient,
	ConverseCommand,
	type Message,
	type SystemContentBlock,
	type Tool,
	type ContentBlock
} from '@aws-sdk/client-bedrock-runtime';

function getClient() {
	return new BedrockRuntimeClient({
		region: env.AWS_REGION || env.AWS_DEFAULT_REGION || 'us-west-2',
		credentials: {
			accessKeyId: env.AWS_ACCESS_KEY_ID!,
			secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
			...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {})
		}
	});
}

function validateToken(request: Request) {
	const token = env.VIBE_LLM_PROXY_TOKEN;
	if (!token) return; // no token configured = open (dev only)
	const auth = request.headers.get('authorization');
	if (auth !== `Bearer ${token}`) {
		error(401, 'Invalid proxy token');
	}
}

/** POST /api/sandbox/llm/chat/completions — OpenAI-compatible proxy to AWS Bedrock */
export const POST: RequestHandler = async ({ request }) => {
	validateToken(request);

	const body = await request.json();
	const modelId = body.model || 'mistral.devstral-2-123b';
	const messages: Array<{
		role: string;
		content: string;
		tool_calls?: unknown[];
		tool_call_id?: string;
	}> = body.messages || [];
	const temperature = body.temperature ?? 0.2;
	const maxTokens = body.max_tokens ?? 8192;
	const tools:
		| Array<{ function: { name: string; description?: string; parameters?: unknown } }>
		| undefined = body.tools;

	// Convert OpenAI format → Bedrock format
	const bedrockMessages: Message[] = [];
	const systemPrompts: SystemContentBlock[] = [];

	for (const msg of messages) {
		if (msg.role === 'system') {
			systemPrompts.push({
				text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
			});
			continue;
		}
		if (msg.role === 'assistant' && msg.tool_calls) {
			const tc = (
				msg.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }>
			)[0];
			bedrockMessages.push({
				role: 'assistant',
				content: [
					{
						toolUse: {
							toolUseId: tc.id,
							name: tc.function.name,
							input: JSON.parse(tc.function.arguments)
						}
					}
				]
			});
			continue;
		}
		if (msg.role === 'tool') {
			bedrockMessages.push({
				role: 'user',
				content: [
					{
						toolResult: {
							toolUseId: msg.tool_call_id || '',
							content: [
								{
									text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
								}
							]
						}
					}
				]
			});
			continue;
		}
		bedrockMessages.push({
			role: msg.role as 'user' | 'assistant',
			content: [
				{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }
			]
		});
	}

	const commandInput: ConstructorParameters<typeof ConverseCommand>[0] = {
		modelId,
		messages: bedrockMessages,
		inferenceConfig: { temperature, maxTokens }
	};
	if (systemPrompts.length > 0) {
		commandInput.system = systemPrompts;
	}
	if (tools) {
		commandInput.toolConfig = {
			tools: tools.map((t) => ({
				toolSpec: {
					name: t.function.name,
					description: t.function.description || '',
					inputSchema: { json: t.function.parameters as Record<string, unknown> }
				}
			})) as Tool[]
		};
	}

	console.warn(
		`[llm-proxy] converse model=${modelId} messages=${bedrockMessages.length} tools=${tools?.length ?? 0}`
	);

	try {
		const client = getClient();
		const resp = await client.send(new ConverseCommand(commandInput));

		const contentBlocks: ContentBlock[] = resp.output?.message?.content ?? [];
		const textParts = contentBlocks.filter((b) => b.text).map((b) => b.text!);
		const toolUses = contentBlocks.filter((b) => b.toolUse);

		let toolCalls = null;
		if (toolUses.length > 0) {
			toolCalls = toolUses.map((tu) => ({
				id: tu.toolUse!.toolUseId,
				type: 'function' as const,
				function: {
					name: tu.toolUse!.name!,
					arguments: JSON.stringify(tu.toolUse!.input)
				}
			}));
		}

		const finishReason = toolCalls ? 'tool_calls' : 'stop';
		const inputTokens = resp.usage?.inputTokens ?? 0;
		const outputTokens = resp.usage?.outputTokens ?? 0;

		return json({
			id: 'chatcmpl-bedrock',
			object: 'chat.completion',
			choices: [
				{
					index: 0,
					message: {
						role: 'assistant',
						content: textParts.length > 0 ? textParts.join('') : null,
						tool_calls: toolCalls
					},
					finish_reason: finishReason
				}
			],
			usage: {
				prompt_tokens: inputTokens,
				completion_tokens: outputTokens,
				total_tokens: inputTokens + outputTokens
			}
		});
	} catch (e) {
		console.error(`[llm-proxy] bedrock error: ${e instanceof Error ? e.message : String(e)}`);
		return json(
			{ error: { message: e instanceof Error ? e.message : String(e), type: 'bedrock_error' } },
			{ status: 502 }
		);
	}
};
