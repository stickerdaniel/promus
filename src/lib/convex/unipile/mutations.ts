import { mutation } from './_generated/server';
import { v } from 'convex/values';

export const registerAccount = mutation({
	args: {
		userId: v.string(),
		unipileAccountId: v.string(),
		provider: v.string()
	},
	returns: v.null(),
	handler: async (ctx, { userId, unipileAccountId, provider }) => {
		// Check if this Unipile account is already registered
		const existing = await ctx.db
			.query('accounts')
			.withIndex('by_unipile_account', (q) => q.eq('unipileAccountId', unipileAccountId))
			.first();
		if (existing) {
			// Idempotent for same user, but block cross-user hijack
			if (existing.userId !== userId) {
				throw new Error('Account already registered to another user');
			}
			return null;
		}

		await ctx.db.insert('accounts', {
			userId,
			unipileAccountId,
			provider,
			status: 'connected',
			connectedAt: Date.now()
		});
		return null;
	}
});

export const unregisterAccount = mutation({
	args: {
		userId: v.string(),
		unipileAccountId: v.string()
	},
	returns: v.null(),
	handler: async (ctx, { userId, unipileAccountId }) => {
		const row = await ctx.db
			.query('accounts')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.filter((q) => q.eq(q.field('unipileAccountId'), unipileAccountId))
			.first();
		if (row) {
			await ctx.db.delete(row._id);
		}
		return null;
	}
});
