import { query, action } from './_generated/server';
import { components, internal } from './_generated/api';
import { v } from 'convex/values';
import { unipileConfig, getSiteUrl, getConvexSiteUrl } from './env';
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

		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const convexSiteUrl = getConvexSiteUrl();

		// Generate nonce and webhook URL if CONVEX_SITE_URL is configured
		let notifyUrl: string | undefined;
		let nonce: string | undefined;

		if (convexSiteUrl) {
			nonce = crypto.randomUUID();
			notifyUrl = `${convexSiteUrl}/unipile-webhook`;

			await ctx.runMutation(internal.unipileWebhook.createPendingAuth, {
				nonce,
				userId: user._id
			});
		}

		return await ctx.runAction(components.unipile.actions.getHostedAuthLink, {
			dsn: unipileConfig.dsn,
			apiKey: unipileConfig.apiKey,
			siteUrl: getSiteUrl(),
			notifyUrl,
			name: nonce
		});
	}
});

/**
 * List only this user's Unipile accounts by fetching each known ID individually.
 * Never calls GET /accounts (global list).
 */
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

		// Get only this user's registered account IDs from our DB
		const userAccountIds = await ctx.runQuery(components.unipile.queries.getUserAccountIds, {
			userId: user._id
		});

		// Fetch each account individually — skip 404s (deleted on Unipile side)
		const items = [];
		for (const accountId of userAccountIds) {
			const account = await ctx.runAction(components.unipile.actions.getAccount, {
				dsn: unipileConfig.dsn!,
				apiKey: unipileConfig.apiKey!,
				accountId
			});
			if (account) items.push(account);
		}

		return { items };
	}
});

/**
 * Reactive query: returns the most recent pending auth status for the current user.
 * Used by the sidebar to detect when a webhook completes or expires.
 */
export const checkPendingAuthStatus = query({
	args: {},
	returns: v.union(
		v.object({
			status: v.union(v.literal('pending'), v.literal('completed'), v.literal('expired')),
			unipileAccountId: v.optional(v.string())
		}),
		v.null()
	),
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		const pending = await ctx.db
			.query('pendingUnipileAuth')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.order('desc')
			.first();

		if (!pending) return null;

		return {
			status: pending.status,
			unipileAccountId: pending.unipileAccountId
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
