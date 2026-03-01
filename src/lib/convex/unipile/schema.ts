import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	accounts: defineTable({
		userId: v.string(),
		unipileAccountId: v.string(),
		provider: v.string(),
		status: v.string(),
		connectedAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_unipile_account', ['unipileAccountId'])
});
