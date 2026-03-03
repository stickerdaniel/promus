import { internalMutation, internalQuery } from '../_generated/server';
import { v } from 'convex/values';

/**
 * Find scripts matching a keyword query across slug, title, description, and tags.
 */
export const findScripts = internalQuery({
	args: {
		userId: v.string(),
		query: v.string()
	},
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query('savedScripts')
			.withIndex('by_user', (q) => q.eq('userId', args.userId))
			.collect();

		const q = args.query.toLowerCase();
		return all.filter(
			(s) =>
				s.slug.toLowerCase().includes(q) ||
				s.title.toLowerCase().includes(q) ||
				s.description.toLowerCase().includes(q) ||
				s.tags.some((t) => t.toLowerCase().includes(q))
		);
	}
});

/**
 * Get all scripts for a user as a slug → code map (used to populate /scripts/ in session).
 */
export const getAllScripts = internalQuery({
	args: {
		userId: v.string()
	},
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query('savedScripts')
			.withIndex('by_user', (q) => q.eq('userId', args.userId))
			.collect();

		const result: Record<string, string> = {};
		for (const s of all) {
			result[s.slug] = s.code;
		}
		return result;
	}
});

/**
 * Save or update a script. Uses slug as the unique key per user.
 */
export const saveScript = internalMutation({
	args: {
		userId: v.string(),
		slug: v.string(),
		title: v.string(),
		description: v.string(),
		code: v.string(),
		tags: v.array(v.string()),
		skipIfExists: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('savedScripts')
			.withIndex('by_user_slug', (q) => q.eq('userId', args.userId).eq('slug', args.slug))
			.first();

		if (existing) {
			if (args.skipIfExists) return existing._id;
			await ctx.db.patch(existing._id, {
				title: args.title,
				description: args.description,
				code: args.code,
				tags: args.tags,
				updatedAt: Date.now()
			});
			return existing._id;
		}

		return await ctx.db.insert('savedScripts', {
			userId: args.userId,
			slug: args.slug,
			title: args.title,
			description: args.description,
			code: args.code,
			tags: args.tags,
			createdAt: Date.now(),
			updatedAt: Date.now()
		});
	}
});
