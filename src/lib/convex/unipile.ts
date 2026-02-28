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

		// Fetch all Unipile accounts from the API
		const allAccounts = await ctx.runAction(components.unipile.actions.listAccounts, {
			dsn: unipileConfig.dsn,
			apiKey: unipileConfig.apiKey
		});

		// Get this user's registered account IDs
		const userAccountIds = await ctx.runQuery(components.unipile.queries.getUserAccountIds, {
			userId: user._id
		});
		const userIds = new Set(userAccountIds);

		// Get ALL registered account IDs to find unclaimed ones
		const allRegisteredIds = await ctx.runQuery(
			components.unipile.queries.getAllRegisteredAccountIds,
			{}
		);
		const claimedIds = new Set(allRegisteredIds);

		// Auto-claim unclaimed accounts for the current user
		const unclaimed = allAccounts.items.filter((a) => !claimedIds.has(a.id));
		for (const account of unclaimed) {
			await ctx.runMutation(components.unipile.mutations.registerAccount, {
				userId: user._id,
				unipileAccountId: account.id,
				provider: account.type
			});
			userIds.add(account.id);
		}

		// Return only this user's accounts
		return {
			items: allAccounts.items.filter((a) => userIds.has(a.id))
		};
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

		// Verify the account belongs to this user
		const userAccountIds = await ctx.runQuery(components.unipile.queries.getUserAccountIds, {
			userId: user._id
		});
		if (!userAccountIds.includes(accountId)) {
			throw new Error('Account not found');
		}

		// Delete from Unipile API
		const result = await ctx.runAction(components.unipile.actions.deleteAccount, {
			dsn: unipileConfig.dsn,
			apiKey: unipileConfig.apiKey,
			accountId
		});

		// Remove from ownership table
		await ctx.runMutation(components.unipile.mutations.unregisterAccount, {
			userId: user._id,
			unipileAccountId: accountId
		});

		return result;
	}
});
