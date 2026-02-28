import { v } from 'convex/values';
import { query, mutation } from './_generated/server';

export const getUserSession = query({
	args: { userId: v.string() },
	handler: async (ctx, { userId }) => {
		const session = await ctx.db
			.query('sessions')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.order('desc')
			.filter((q) => q.neq(q.field('status'), 'deleted'))
			.first();
		return session ?? null;
	}
});

export const createSession = mutation({
	args: {
		userId: v.string(),
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
		// Soft-delete any existing non-deleted sessions for this user
		const existing = await ctx.db
			.query('sessions')
			.withIndex('by_user', (q) => q.eq('userId', args.userId))
			.filter((q) => q.neq(q.field('status'), 'deleted'))
			.collect();
		for (const s of existing) {
			await ctx.db.patch(s._id, { status: 'deleted' as const });
		}

		const now = Date.now();
		const id = await ctx.db.insert('sessions', {
			...args,
			lastActiveAt: now,
			createdAt: now
		});
		return id;
	}
});

export const updateSessionStatus = mutation({
	args: {
		sessionId: v.id('sessions'),
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
	handler: async (ctx, { sessionId, ...patch }) => {
		await ctx.db.patch(sessionId, patch);
	}
});

export const updateLastActive = mutation({
	args: { sessionId: v.id('sessions') },
	handler: async (ctx, { sessionId }) => {
		await ctx.db.patch(sessionId, { lastActiveAt: Date.now() });
	}
});

export const deleteSession = mutation({
	args: { sessionId: v.id('sessions') },
	handler: async (ctx, { sessionId }) => {
		await ctx.db.patch(sessionId, { status: 'deleted' as const });
	}
});
