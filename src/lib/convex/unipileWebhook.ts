import { internalMutation, internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { components } from './_generated/api';
import { v } from 'convex/values';
import { unipileConfig } from './env';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

/**
 * Create a pending auth record with a nonce for webhook correlation.
 * Called before generating the hosted auth link.
 */
export const createPendingAuth = internalMutation({
	args: {
		nonce: v.string(),
		userId: v.string()
	},
	returns: v.null(),
	handler: async (ctx, { nonce, userId }) => {
		const now = Date.now();
		await ctx.db.insert('pendingUnipileAuth', {
			nonce,
			userId,
			createdAt: now,
			expiresAt: now + TWENTY_FOUR_HOURS,
			status: 'pending'
		});
		return null;
	}
});

/**
 * Receive a webhook callback from Unipile.
 * Validates the nonce exists and is pending, then schedules async processing.
 */
export const receiveWebhook = internalMutation({
	args: {
		nonce: v.string(),
		accountId: v.optional(v.string())
	},
	returns: v.boolean(),
	handler: async (ctx, { nonce, accountId }) => {
		const pending = await ctx.db
			.query('pendingUnipileAuth')
			.withIndex('by_nonce', (q) => q.eq('nonce', nonce))
			.first();

		if (!pending || pending.status !== 'pending') {
			return false;
		}

		// Schedule async processing (action can call Unipile API)
		await ctx.scheduler.runAfter(0, internal.unipileWebhook.handleWebhookPayload, {
			nonce,
			accountId,
			userId: pending.userId,
			attempt: 1
		});

		return true;
	}
});

/**
 * Fetch the new account from Unipile API and register it.
 * Retries up to 3x with backoff if account not yet visible.
 */
export const handleWebhookPayload = internalAction({
	args: {
		nonce: v.string(),
		accountId: v.optional(v.string()),
		userId: v.string(),
		attempt: v.number()
	},
	handler: async (ctx, { nonce, accountId, userId, attempt }) => {
		if (!unipileConfig.enabled || !unipileConfig.dsn || !unipileConfig.apiKey) {
			console.error('Unipile not configured, cannot process webhook');
			return;
		}

		const MAX_ATTEMPTS = 3;

		// If we have a direct accountId from the webhook, try to fetch it
		if (accountId) {
			try {
				const response = await fetch(`https://${unipileConfig.dsn}/api/v1/accounts/${accountId}`, {
					method: 'GET',
					headers: { 'X-API-KEY': unipileConfig.apiKey! }
				});

				if (response.ok) {
					const account = (await response.json()) as {
						id: string;
						type: string;
					};
					await ctx.runMutation(internal.unipileWebhook.completeAuthFromWebhook, {
						nonce,
						userId,
						unipileAccountId: account.id,
						provider: account.type
					});
					return;
				}
			} catch (e) {
				console.warn(`Failed to fetch account ${accountId}:`, e);
			}
		}

		// Fallback: list all accounts and find unclaimed ones
		try {
			const allAccounts = await ctx.runAction(components.unipile.actions.listAccounts, {
				dsn: unipileConfig.dsn!,
				apiKey: unipileConfig.apiKey!
			});

			const allRegisteredIds = await ctx.runQuery(
				components.unipile.queries.getAllRegisteredAccountIds,
				{}
			);
			const claimedIds = new Set(allRegisteredIds);

			// Find the first unclaimed account (the one just created via OAuth)
			const newAccount = allAccounts.items.find((a) => !claimedIds.has(a.id));

			if (newAccount) {
				await ctx.runMutation(internal.unipileWebhook.completeAuthFromWebhook, {
					nonce,
					userId,
					unipileAccountId: newAccount.id,
					provider: newAccount.type
				});
				return;
			}
		} catch (e) {
			console.warn(`Failed to list accounts on attempt ${attempt}:`, e);
		}

		// Retry with backoff if account not yet visible
		if (attempt < MAX_ATTEMPTS) {
			const backoffMs = attempt * 2000; // 2s, 4s
			await ctx.scheduler.runAfter(backoffMs, internal.unipileWebhook.handleWebhookPayload, {
				nonce,
				accountId,
				userId,
				attempt: attempt + 1
			});
		} else {
			console.error(`Failed to find new account for nonce ${nonce} after ${MAX_ATTEMPTS} attempts`);
		}
	}
});

/**
 * Mark pending auth as completed and register the account in the component table.
 * Idempotent — safe if both webhook and visibilitychange fire.
 */
export const completeAuthFromWebhook = internalMutation({
	args: {
		nonce: v.string(),
		userId: v.string(),
		unipileAccountId: v.string(),
		provider: v.string()
	},
	returns: v.null(),
	handler: async (ctx, { nonce, userId, unipileAccountId, provider }) => {
		// Mark pending auth as completed
		const pending = await ctx.db
			.query('pendingUnipileAuth')
			.withIndex('by_nonce', (q) => q.eq('nonce', nonce))
			.first();

		if (pending && pending.status === 'pending') {
			await ctx.db.patch(pending._id, {
				status: 'completed',
				unipileAccountId
			});
		}

		// Idempotently register the account (component mutation checks for duplicates)
		await ctx.runMutation(components.unipile.mutations.registerAccount, {
			userId,
			unipileAccountId,
			provider
		});

		return null;
	}
});
