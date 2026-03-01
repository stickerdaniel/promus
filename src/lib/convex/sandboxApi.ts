import { v } from 'convex/values';
import { components } from './_generated/api';
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

/**
 * Save a user message to the thread. Does NOT trigger vibe execution —
 * the SvelteKit /api/sandbox/run route handles that via Daytona SDK.
 */
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
			`[sandboxApi.sendMessage] userId=${ctx.user._id} threadId=${args.threadId} messageId=${messageId}`
		);
		return { messageId };
	}
});

/**
 * Save an assistant message to the thread.
 * Called by the SvelteKit /api/sandbox/run route after vibe execution.
 */
export const saveAssistantMessage = authedMutation({
	args: {
		threadId: v.string(),
		content: v.string()
	},
	handler: async (ctx, args) => {
		const { messageId } = await vibeAgent.saveMessage(ctx, {
			threadId: args.threadId,
			message: { role: 'assistant', content: args.content },
			skipEmbeddings: true
		});
		console.info(
			`[sandboxApi.saveAssistantMessage] threadId=${args.threadId} messageId=${messageId}`
		);
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
