import { query } from './_generated/server';
import { v } from 'convex/values';

export const getUserAccountIds = query({
	args: { userId: v.string() },
	returns: v.array(v.string()),
	handler: async (ctx, { userId }) => {
		const rows = await ctx.db
			.query('accounts')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.collect();
		return rows.map((r) => r.unipileAccountId);
	}
});

export const getAllRegisteredAccountIds = query({
	args: {},
	returns: v.array(v.string()),
	handler: async (ctx) => {
		const rows = await ctx.db.query('accounts').collect();
		return rows.map((r) => r.unipileAccountId);
	}
});
