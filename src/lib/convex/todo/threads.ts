import { v } from 'convex/values';
import { todoAgent } from './agent';
import { authedMutation } from '../functions';

/**
 * Create a new thread for the todo board chat
 */
export const createThread = authedMutation({
	args: {
		taskTitle: v.optional(v.string()),
		taskNotes: v.optional(v.string()),
		taskColumn: v.optional(v.string())
	},
	returns: v.object({
		threadId: v.string()
	}),
	handler: async (ctx, args) => {
		const { threadId } = await todoAgent.createThread(ctx, {
			userId: ctx.user._id,
			title: args.taskTitle || 'Board Chat'
		});

		return { threadId };
	}
});
