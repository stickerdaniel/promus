import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { components, internal } from './_generated/api';
import { authedQuery, authedMutation } from './functions';
import { vibeAgent } from './sandboxAgent';
import { paginationOptsValidator } from 'convex/server';
import { listUIMessages, syncStreams } from '@convex-dev/agent';
import { vStreamArgs } from '@convex-dev/agent/validators';

function preview(text: string, max = 220): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}...`;
}

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
 * Internal action to fetch vibe response from sandbox
 *
 * Looks up the user's sandbox session, calls the sandbox's /chat/stream
 * endpoint, accumulates the SSE response, and saves as assistant message.
 */
export const createVibeResponse = internalAction({
	args: {
		threadId: v.string(),
		userId: v.string(),
		messageId: v.string()
	},
	handler: async (ctx, args) => {
		const traceId = args.messageId.slice(-8);
		console.info(
			`[createVibeResponse:${traceId}] start threadId=${args.threadId} userId=${args.userId} messageId=${args.messageId}`
		);
		const [triggerMessage] = await ctx.runQuery(components.agent.messages.getMessagesByIds, {
			messageIds: [args.messageId]
		});
		if (!triggerMessage || triggerMessage.threadId !== args.threadId) {
			console.error(
				`[createVibeResponse:${traceId}] trigger message not found or mismatched thread`
			);
			return;
		}

		const msg = triggerMessage.message;
		let prompt = '';
		if (!msg) {
			console.error(`[createVibeResponse:${traceId}] trigger message has no content`);
			return;
		}
		if (typeof msg === 'string') {
			prompt = msg;
		} else if (typeof msg.content === 'string') {
			prompt = msg.content;
		} else if (Array.isArray(msg.content)) {
			const textPart = msg.content.find(
				(p): p is { type: 'text'; text: string } =>
					p.type === 'text' && 'text' in p && typeof p.text === 'string'
			);
			prompt = textPart?.text || '';
		}

		if (!prompt) {
			console.error(
				`[createVibeResponse:${traceId}] could not extract prompt from trigger message`
			);
			return;
		}
		console.info(
			`[createVibeResponse:${traceId}] prompt extracted length=${prompt.length} preview=${JSON.stringify(preview(prompt))}`
		);

		// Look up user's sandbox session
		const session = await ctx.runQuery(components.sandbox.sessions.getUserSession, {
			userId: args.userId
		});

		if (!session || !session.previewUrl) {
			console.error(`[createVibeResponse:${traceId}] session missing or previewUrl unavailable`);
			await vibeAgent.saveMessage(ctx, {
				threadId: args.threadId,
				message: { role: 'assistant', content: 'Error: Sandbox session not found or not ready.' },
				skipEmbeddings: true
			});
			return;
		}

		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (session.previewToken) {
			headers['Authorization'] = `Bearer ${session.previewToken}`;
		}
		headers['X-Sandbox-Trace-Id'] = traceId;

		try {
			console.info(
				`[createVibeResponse:${traceId}] requesting sandbox endpoint=${session.previewUrl}/chat/stream`
			);
			const abortController = new AbortController();
			const timeoutMs = 120000;
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
			console.info(
				`[createVibeResponse:${traceId}] sandbox response status=${response.status} contentType=${response.headers.get('content-type') ?? 'unknown'} hasBody=${Boolean(response.body)}`
			);

			if (!response.ok || !response.body) {
				const errorText = await response.text().catch(() => '');
				console.error(
					`[createVibeResponse:${traceId}] sandbox HTTP failure status=${response.status} bodyPreview=${JSON.stringify(preview(errorText || ''))}`
				);
				await ctx.runMutation(components.sandbox.sessions.updateSessionStatus, {
					sessionId: session._id,
					status: 'error',
					errorMessage: `Sandbox returned ${response.status}`
				});
				await vibeAgent.saveMessage(ctx, {
					threadId: args.threadId,
					message: {
						role: 'assistant',
						content: `Error: Failed to connect to sandbox (${response.status})`
					},
					skipEmbeddings: true
				});
				return;
			}

			// Read SSE stream and accumulate content (buffered for chunk-safe line parsing)
			let assistantContent = '';
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let chunkCount = 0;
			let dataEventCount = 0;
			const appendData = (data: string) => {
				dataEventCount += 1;
				try {
					const parsed = JSON.parse(data);
					if (parsed.type === 'done') return;
					if (parsed.type === 'error') {
						console.error(
							`[createVibeResponse:${traceId}] sandbox emitted error event payload=${JSON.stringify(preview(data))}`
						);
						if (typeof parsed.message === 'string') assistantContent += parsed.message;
						return;
					}
					if (parsed.content) assistantContent += parsed.content;
					else assistantContent += data;
				} catch {
					assistantContent += data;
				}
			};

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunkCount += 1;
				if (chunkCount <= 5 || chunkCount % 25 === 0) {
					console.info(
						`[createVibeResponse:${traceId}] stream chunk#${chunkCount} bytes=${value?.byteLength ?? 0}`
					);
				}

				buffer += decoder.decode(value, { stream: true });
				let newlineIndex = buffer.indexOf('\n');
				while (newlineIndex !== -1) {
					const rawLine = buffer.slice(0, newlineIndex);
					buffer = buffer.slice(newlineIndex + 1);
					const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
					if (line.startsWith('data:')) {
						appendData(line.slice(5).trimStart());
					}
					newlineIndex = buffer.indexOf('\n');
				}
			}

			// Flush remaining bytes from decoder and process final partial line
			buffer += decoder.decode();
			const finalLine = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
			if (finalLine.startsWith('data:')) {
				appendData(finalLine.slice(5).trimStart());
			}
			console.info(
				`[createVibeResponse:${traceId}] stream complete chunks=${chunkCount} dataEvents=${dataEventCount} outputLength=${assistantContent.length}`
			);

			const content = assistantContent.trim() || 'No response received from sandbox.';
			await vibeAgent.saveMessage(ctx, {
				threadId: args.threadId,
				message: { role: 'assistant', content },
				skipEmbeddings: true
			});
			console.info(
				`[createVibeResponse:${traceId}] assistant message saved threadId=${args.threadId} contentLength=${content.length}`
			);
		} catch (error) {
			console.error(
				`[createVibeResponse:${traceId}] failed to fetch from sandbox error=${error instanceof Error ? error.message : String(error)}`
			);
			await ctx.runMutation(components.sandbox.sessions.updateSessionStatus, {
				sessionId: session._id,
				status: 'error',
				errorMessage: error instanceof Error ? error.message : 'Connection failed'
			});
			await vibeAgent.saveMessage(ctx, {
				threadId: args.threadId,
				message: {
					role: 'assistant',
					content: `Error: ${error instanceof Error ? error.message : 'Connection failed'}`
				},
				skipEmbeddings: true
			});
		}
	}
});
