import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { components, internal } from './_generated/api';
import { authedQuery, authedMutation } from './functions';
import { vibeAgent } from './sandboxAgent';
import { paginationOptsValidator } from 'convex/server';
import { listUIMessages, syncStreams } from '@convex-dev/agent';
import { vStreamArgs } from '@convex-dev/agent/validators';

// ── Session management ──────────────────────────────────────────────────────

export const getSession = authedQuery({
	args: {},
	handler: async (ctx) => {
		const session = await ctx.runQuery(components.sandbox.sessions.getUserSession, {
			userId: ctx.user._id
		});
		if (!session) return null;
		const { previewToken: _token, ...safeSession } = session;
		return safeSession;
	}
});

export const createSession = authedMutation({
	args: {
		sandboxId: v.string(),
		status: v.union(
			v.literal('creating'),
			v.literal('ready'),
			v.literal('stopped'),
			v.literal('error'),
			v.literal('deleted')
		),
		previewUrl: v.optional(v.string()),
		previewToken: v.optional(v.string()),
		threadId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		return await ctx.runMutation(components.sandbox.sessions.createSession, {
			userId: ctx.user._id,
			...args
		});
	}
});

export const updateSession = authedMutation({
	args: {
		sessionId: v.string(),
		status: v.union(
			v.literal('creating'),
			v.literal('ready'),
			v.literal('stopped'),
			v.literal('error'),
			v.literal('deleted')
		),
		sandboxId: v.optional(v.string()),
		previewUrl: v.optional(v.string()),
		previewToken: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
		threadId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		return await ctx.runMutation(components.sandbox.sessions.updateSessionStatus, args);
	}
});

export const updateLastActive = authedMutation({
	args: { sessionId: v.string() },
	handler: async (ctx, { sessionId }) => {
		return await ctx.runMutation(components.sandbox.sessions.updateLastActive, { sessionId });
	}
});

export const deleteSession = authedMutation({
	args: { sessionId: v.string() },
	handler: async (ctx, { sessionId }) => {
		return await ctx.runMutation(components.sandbox.sessions.deleteSession, { sessionId });
	}
});

// ── Thread management ───────────────────────────────────────────────────────

export const createThread = authedMutation({
	args: {},
	handler: async (ctx) => {
		const { threadId } = await vibeAgent.createThread(ctx, {
			userId: ctx.user._id,
			title: 'Vibe Sandbox'
		});
		return { threadId };
	}
});

// ── Messages (agent-backed) ─────────────────────────────────────────────────

export const sendMessage = authedMutation({
	args: {
		threadId: v.string(),
		prompt: v.string()
	},
	handler: async (ctx, args) => {
		const { messageId } = await vibeAgent.saveMessage(ctx, {
			threadId: args.threadId,
			prompt: args.prompt,
			skipEmbeddings: true
		});
		console.info(
			`[sandboxApi.sendMessage] userId=${ctx.user._id} threadId=${args.threadId} messageId=${messageId} promptLength=${args.prompt.length}`
		);

		await ctx.scheduler.runAfter(0, internal.sandboxApi.createVibeResponse, {
			threadId: args.threadId,
			userId: ctx.user._id,
			messageId
		});
		console.info(`[sandboxApi.sendMessage] scheduled createVibeResponse messageId=${messageId}`);

		return { messageId };
	}
});

export const listMessages = authedQuery({
	args: {
		threadId: v.string(),
		paginationOpts: paginationOptsValidator,
		streamArgs: vStreamArgs
	},
	handler: async (ctx, args): Promise<unknown> => {
		const paginated = await listUIMessages(ctx, components.agent, {
			threadId: args.threadId,
			paginationOpts: args.paginationOpts
		});

		const streams = await syncStreams(ctx, components.agent, {
			threadId: args.threadId,
			streamArgs: args.streamArgs,
			includeStatuses: ['streaming', 'finished', 'aborted']
		});

		return { ...paginated, streams };
	}
});

// ── Internal actions ────────────────────────────────────────────────────────

/**
 * Internal action to fetch vibe response from sandbox with real-time streaming.
 *
 * Uses the agent component's streaming API to push text deltas as they arrive
 * from the vibe CLI SSE stream. The frontend picks them up via syncStreams
 * for real-time display.
 */
export const createVibeResponse = internalAction({
	args: {
		threadId: v.string(),
		userId: v.string(),
		messageId: v.string()
	},
	handler: async (ctx, args) => {
		const traceId = args.messageId.slice(-8);
		console.info(`[createVibeResponse:${traceId}] start`);

		const [triggerMessage] = await ctx.runQuery(components.agent.messages.getMessagesByIds, {
			messageIds: [args.messageId]
		});
		if (!triggerMessage || triggerMessage.threadId !== args.threadId) {
			console.error(`[createVibeResponse:${traceId}] trigger message not found`);
			return;
		}

		const msg = triggerMessage.message;
		let prompt = '';
		if (typeof msg === 'string') prompt = msg;
		else if (msg && typeof msg.content === 'string') prompt = msg.content;
		else if (msg && Array.isArray(msg.content)) {
			const textPart = msg.content.find(
				(p): p is { type: 'text'; text: string } =>
					p.type === 'text' && 'text' in p && typeof p.text === 'string'
			);
			prompt = textPart?.text || '';
		}
		if (!prompt) {
			console.error(`[createVibeResponse:${traceId}] empty prompt`);
			return;
		}

		const session = await ctx.runQuery(components.sandbox.sessions.getUserSession, {
			userId: args.userId
		});
		if (!session || !session.previewUrl) {
			await vibeAgent.saveMessage(ctx, {
				threadId: args.threadId,
				message: { role: 'assistant', content: 'Error: Sandbox session not found or not ready.' },
				skipEmbeddings: true
			});
			return;
		}

		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (session.previewToken) headers['Authorization'] = `Bearer ${session.previewToken}`;

		// Create a streaming message so frontend shows real-time updates
		const order = triggerMessage.order + 1;
		const streamId = await ctx.runMutation(components.agent.streams.create, {
			threadId: args.threadId,
			order,
			stepOrder: 0,
			format: 'TextStreamPart',
			agentName: 'Vibe',
			model: 'devstral-2',
			provider: 'bedrock'
		});
		console.info(`[createVibeResponse:${traceId}] stream created streamId=${streamId}`);

		let deltaCursor = 0;
		let assistantContent = '';
		let dataEventCount = 0;

		const pushDelta = async (text: string) => {
			if (!text) return;
			assistantContent += text;
			const end = deltaCursor + 1;
			await ctx.runMutation(components.agent.streams.addDelta, {
				streamId,
				start: deltaCursor,
				end,
				parts: [{ type: 'text-delta', textDelta: text }]
			});
			deltaCursor = end;
		};

		try {
			const abortController = new AbortController();
			const timeoutMs = 600000; // 10 min for long vibe runs
			const timeout = setTimeout(() => abortController.abort(), timeoutMs);
			let response: Response;
			try {
				response = await fetch(`${session.previewUrl}/chat/stream`, {
					method: 'POST',
					headers,
					body: JSON.stringify({ prompt, traceId }),
					signal: abortController.signal
				});
			} finally {
				clearTimeout(timeout);
			}

			if (!response.ok || !response.body) {
				const errorText = await response.text().catch(() => '');
				await pushDelta(`Error: Sandbox returned ${response.status}\n${errorText.slice(0, 220)}`);
				await ctx.runMutation(components.agent.streams.abort, { streamId, reason: 'error' });
				return;
			}

			// Stream SSE chunks and push text deltas in real-time
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let chunkCount = 0;

			const processDataLine = async (data: string) => {
				dataEventCount += 1;
				try {
					const parsed = JSON.parse(data);
					if (parsed.type === 'done') return;
					if (parsed.type === 'error') {
						await pushDelta(parsed.message || data);
						return;
					}
					if (parsed.content) await pushDelta(parsed.content + '\n');
					else await pushDelta(data + '\n');
				} catch {
					await pushDelta(data + '\n');
				}
			};

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunkCount += 1;

				buffer += decoder.decode(value, { stream: true });
				let newlineIndex = buffer.indexOf('\n');
				while (newlineIndex !== -1) {
					const rawLine = buffer.slice(0, newlineIndex);
					buffer = buffer.slice(newlineIndex + 1);
					const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
					if (line.startsWith('data:')) {
						await processDataLine(line.slice(5).trimStart());
					}
					newlineIndex = buffer.indexOf('\n');
				}
			}

			// Flush remaining
			buffer += decoder.decode();
			const finalLine = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
			if (finalLine.startsWith('data:')) {
				await processDataLine(finalLine.slice(5).trimStart());
			}

			console.info(
				`[createVibeResponse:${traceId}] complete chunks=${chunkCount} deltas=${deltaCursor} contentLen=${assistantContent.length}`
			);

			// Finalize: save truncated message for persistence and finish the stream
			const MAX_MSG = 800_000; // ~800KB, safely under 1MiB Convex limit
			const finalContent = assistantContent.trim() || 'No response received from sandbox.';
			const truncated =
				finalContent.length > MAX_MSG
					? finalContent.slice(0, MAX_MSG) + '\n\n[Output truncated]'
					: finalContent;
			await vibeAgent.saveMessage(ctx, {
				threadId: args.threadId,
				message: { role: 'assistant', content: truncated },
				skipEmbeddings: true
			});
			await ctx.runMutation(components.agent.streams.finish, { streamId });
		} catch (error) {
			console.error(
				`[createVibeResponse:${traceId}] error: ${error instanceof Error ? error.message : String(error)}`
			);
			await pushDelta(`\nError: ${error instanceof Error ? error.message : 'Connection failed'}`);
			await ctx.runMutation(components.agent.streams.abort, { streamId, reason: 'error' });
			const errContent =
				assistantContent ||
				`Error: ${error instanceof Error ? error.message : 'Connection failed'}`;
			await vibeAgent.saveMessage(ctx, {
				threadId: args.threadId,
				message: { role: 'assistant', content: errContent.slice(0, 800_000) },
				skipEmbeddings: true
			});
		}
	}
});
