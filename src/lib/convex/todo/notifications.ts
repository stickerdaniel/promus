import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';

export const createNotification = internalMutation({
	args: {
		userId: v.string(),
		fromTaskId: v.string(),
		toTaskId: v.string(),
		message: v.string(),
		priority: v.union(v.literal('low'), v.literal('normal'), v.literal('high')),
		depth: v.number()
	},
	handler: async (ctx, args) => {
		await ctx.db.insert('taskNotifications', {
			userId: args.userId,
			fromTaskId: args.fromTaskId,
			toTaskId: args.toTaskId,
			message: args.message,
			priority: args.priority,
			depth: args.depth,
			status: 'pending',
			createdAt: Date.now()
		});
	}
});

export const getPendingNotifications = internalQuery({
	args: { userId: v.string(), taskId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query('taskNotifications')
			.withIndex('by_user_target_status', (q) =>
				q.eq('userId', args.userId).eq('toTaskId', args.taskId).eq('status', 'pending')
			)
			.collect();
	}
});

export const clearPendingNotifications = internalMutation({
	args: { userId: v.string(), taskId: v.string() },
	handler: async (ctx, args) => {
		const pending = await ctx.db
			.query('taskNotifications')
			.withIndex('by_user_target_status', (q) =>
				q.eq('userId', args.userId).eq('toTaskId', args.taskId).eq('status', 'pending')
			)
			.collect();
		const now = Date.now();
		for (const n of pending) {
			await ctx.db.patch(n._id, { status: 'delivered' as const, deliveredAt: now });
		}
	}
});

export const countRecentNotificationsFrom = internalQuery({
	args: { userId: v.string(), fromTaskId: v.string(), sinceMs: v.number() },
	handler: async (ctx, args) => {
		const cutoff = Date.now() - args.sinceMs;
		const notifications = await ctx.db
			.query('taskNotifications')
			.withIndex('by_user_source', (q) =>
				q.eq('userId', args.userId).eq('fromTaskId', args.fromTaskId)
			)
			.filter((q) => q.gte(q.field('createdAt'), cutoff))
			.collect();
		return notifications.length;
	}
});

export const getMaxDepthForTask = internalQuery({
	args: { userId: v.string(), taskId: v.string() },
	handler: async (ctx, args) => {
		const pending = await ctx.db
			.query('taskNotifications')
			.withIndex('by_user_target_status', (q) =>
				q.eq('userId', args.userId).eq('toTaskId', args.taskId).eq('status', 'pending')
			)
			.collect();
		if (pending.length === 0) return 0;
		return Math.max(...pending.map((n) => n.depth));
	}
});
