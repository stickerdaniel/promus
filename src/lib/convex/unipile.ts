import { query, action } from './_generated/server';
import { components } from './_generated/api';
import { v } from 'convex/values';
import { unipileConfig, getSiteUrl } from './env';
import { authComponent } from './auth';

export const isUnipileEnabled = query({
	args: {},
	returns: v.object({ enabled: v.boolean() }),
	handler: async () => {
		return { enabled: unipileConfig.enabled };
	}
});

export const getHostedAuthLink = action({
	args: {},
	returns: v.object({ url: v.string() }),
	handler: async (ctx) => {
		if (!unipileConfig.enabled || !unipileConfig.dsn || !unipileConfig.apiKey) {
			throw new Error('Unipile is not configured');
		}

		return await ctx.runAction(components.unipile.actions.getHostedAuthLink, {
			dsn: unipileConfig.dsn,
			apiKey: unipileConfig.apiKey,
			siteUrl: getSiteUrl()
		});
	}
});

export const listAccounts = action({
	args: {},
	returns: v.object({
		items: v.array(
			v.object({
				id: v.string(),
				name: v.string(),
				type: v.string(),
				created_at: v.string(),
				sources: v.array(
					v.object({
						id: v.string(),
						status: v.string()
					})
				)
			})
		)
	}),
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		if (!unipileConfig.enabled || !unipileConfig.dsn || !unipileConfig.apiKey) {
			throw new Error('Unipile is not configured');
		}

		return await ctx.runAction(components.unipile.actions.listAccounts, {
			dsn: unipileConfig.dsn,
			apiKey: unipileConfig.apiKey
		});
	}
});

export const deleteAccount = action({
	args: { accountId: v.string() },
	returns: v.object({ object: v.string() }),
	handler: async (ctx, { accountId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		if (!unipileConfig.enabled || !unipileConfig.dsn || !unipileConfig.apiKey) {
			throw new Error('Unipile is not configured');
		}

		return await ctx.runAction(components.unipile.actions.deleteAccount, {
			dsn: unipileConfig.dsn,
			apiKey: unipileConfig.apiKey,
			accountId
		});
	}
});
