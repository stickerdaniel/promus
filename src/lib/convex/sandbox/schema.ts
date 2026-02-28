import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	sessions: defineTable({
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
		threadId: v.optional(v.string()),
		lastActiveAt: v.number(),
		createdAt: v.number(),
		errorMessage: v.optional(v.string())
	})
		.index('by_user', ['userId'])
		.index('by_user_status', ['userId', 'status'])
		.index('by_sandbox', ['sandboxId'])
});
