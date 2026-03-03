import {
	query,
	action,
	internalQuery,
	internalMutation,
	internalAction
} from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { authComponent } from './auth';
import { openaiOAuth } from './env';

const CLIENT_ID = openaiOAuth.clientId;
const ISSUER = 'https://auth.openai.com';
export const CODEX_API_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';

// =============================================================================
// JWT Parsing (adapted from opencode's codex.ts)
// =============================================================================

interface IdTokenClaims {
	chatgpt_account_id?: string;
	organizations?: Array<{ id: string }>;
	email?: string;
	'https://api.openai.com/auth'?: {
		chatgpt_account_id?: string;
	};
}

function parseJwtClaims(token: string): IdTokenClaims | undefined {
	const parts = token.split('.');
	if (parts.length !== 3) return undefined;
	try {
		// Convex actions run in Node, so Buffer is available
		return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
	} catch {
		return undefined;
	}
}

function extractAccountId(tokens: { id_token?: string; access_token: string }): string | undefined {
	const extractFromClaims = (claims: IdTokenClaims): string | undefined =>
		claims.chatgpt_account_id ||
		claims['https://api.openai.com/auth']?.chatgpt_account_id ||
		claims.organizations?.[0]?.id;

	if (tokens.id_token) {
		const claims = parseJwtClaims(tokens.id_token);
		const accountId = claims && extractFromClaims(claims);
		if (accountId) return accountId;
	}
	if (tokens.access_token) {
		const claims = parseJwtClaims(tokens.access_token);
		return claims ? extractFromClaims(claims) : undefined;
	}
	return undefined;
}

function extractEmail(tokens: { id_token?: string; access_token: string }): string | undefined {
	for (const token of [tokens.id_token, tokens.access_token]) {
		if (!token) continue;
		const claims = parseJwtClaims(token);
		if (claims?.email) return claims.email;
	}
	return undefined;
}

// =============================================================================
// Queries
// =============================================================================

/** Get connection status + email (no tokens exposed to client) */
export const getConnection = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		const connection = await ctx.db
			.query('openaiConnections')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.unique();

		if (!connection) return null;

		return {
			email: connection.email,
			accountId: connection.accountId,
			connectedAt: connection.connectedAt,
			isExpired: connection.expiresAt < Date.now()
		};
	}
});

// =============================================================================
// Internal Mutations (not exposed to client)
// =============================================================================

/** Store or update OAuth tokens for a user */
export const storeTokens = internalMutation({
	args: {
		userId: v.string(),
		accessToken: v.string(),
		refreshToken: v.string(),
		expiresAt: v.number(),
		accountId: v.optional(v.string()),
		email: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('openaiConnections')
			.withIndex('by_user', (q) => q.eq('userId', args.userId))
			.unique();

		const now = Date.now();

		if (existing) {
			await ctx.db.patch(existing._id, {
				accessToken: args.accessToken,
				refreshToken: args.refreshToken,
				expiresAt: args.expiresAt,
				accountId: args.accountId ?? existing.accountId,
				email: args.email ?? existing.email,
				updatedAt: now
			});
		} else {
			await ctx.db.insert('openaiConnections', {
				userId: args.userId,
				accessToken: args.accessToken,
				refreshToken: args.refreshToken,
				expiresAt: args.expiresAt,
				accountId: args.accountId,
				email: args.email,
				connectedAt: now,
				updatedAt: now
			});
		}
	}
});

// =============================================================================
// User-Facing Mutations
// =============================================================================

/** Delete the user's OpenAI connection */
export const deleteConnection = action({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const connection = await ctx.runQuery(internal.openai.getConnectionInternal, {
			userId: user._id
		});
		if (connection) {
			await ctx.runMutation(internal.openai.deleteConnectionInternal, {
				connectionId: connection._id
			});
		}

		return null;
	}
});

/** Internal query to get connection with ID (for deletion) */
export const getConnectionInternal = internalQuery({
	args: { userId: v.string() },
	handler: async (ctx, { userId }) => {
		return await ctx.db
			.query('openaiConnections')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();
	}
});

/** Internal mutation to delete by document ID */
export const deleteConnectionInternal = internalMutation({
	args: { connectionId: v.id('openaiConnections') },
	handler: async (ctx, { connectionId }) => {
		await ctx.db.delete(connectionId);
	}
});

// =============================================================================
// Actions — Device Code Flow
// =============================================================================

/** Initiate device authorization — returns user code + verification URL */
export const initiateDeviceAuth = action({
	args: {},
	returns: v.object({
		deviceAuthId: v.string(),
		userCode: v.string(),
		interval: v.number(),
		verificationUrl: v.string()
	}),
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const response = await fetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ client_id: CLIENT_ID })
		});

		if (!response.ok) throw new Error('Failed to initiate device authorization');

		const data = (await response.json()) as {
			device_auth_id: string;
			user_code: string;
			interval: string;
		};

		return {
			deviceAuthId: data.device_auth_id,
			userCode: data.user_code,
			interval: Math.max(parseInt(data.interval) || 5, 1),
			verificationUrl: `${ISSUER}/codex/device`
		};
	}
});

/** Poll for device authorization completion — returns status */
export const pollDeviceAuth = action({
	args: {
		deviceAuthId: v.string(),
		userCode: v.string()
	},
	returns: v.union(v.literal('pending'), v.literal('success'), v.literal('failed')),
	handler: async (ctx, { deviceAuthId, userCode }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		// Poll the device auth token endpoint
		const response = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				device_auth_id: deviceAuthId,
				user_code: userCode
			})
		});

		// 403/404 = still pending
		if (response.status === 403 || response.status === 404) {
			return 'pending';
		}

		if (!response.ok) {
			return 'failed';
		}

		// Success — exchange auth code for tokens
		const data = (await response.json()) as {
			authorization_code: string;
			code_verifier: string;
		};

		const tokenResponse = await fetch(`${ISSUER}/oauth/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: data.authorization_code,
				redirect_uri: `${ISSUER}/deviceauth/callback`,
				client_id: CLIENT_ID,
				code_verifier: data.code_verifier
			}).toString()
		});

		if (!tokenResponse.ok) {
			return 'failed';
		}

		const tokens = (await tokenResponse.json()) as {
			id_token: string;
			access_token: string;
			refresh_token: string;
			expires_in?: number;
		};

		const accountId = extractAccountId(tokens);
		const email = extractEmail(tokens);

		// Store tokens in Convex
		await ctx.runMutation(internal.openai.storeTokens, {
			userId: user._id,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
			accountId,
			email
		});

		return 'success';
	}
});

// =============================================================================
// Internal Action — Token Management (for backend use)
// =============================================================================

/** Get a valid access token for a user, refreshing if needed */
export const getValidAccessToken = internalAction({
	args: { userId: v.string() },
	handler: async (ctx, { userId }): Promise<{ accessToken: string; accountId?: string } | null> => {
		const connection = await ctx.runQuery(internal.openai.getConnectionInternal, {
			userId
		});

		if (!connection) return null;

		// If token is still valid (with 60s buffer), return it
		if (connection.expiresAt > Date.now() + 60_000) {
			return {
				accessToken: connection.accessToken,
				accountId: connection.accountId ?? undefined
			};
		}

		// Refresh the token
		const response = await fetch(`${ISSUER}/oauth/token`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: connection.refreshToken,
				client_id: CLIENT_ID
			}).toString()
		});

		if (!response.ok) {
			console.error('OpenAI token refresh failed:', response.status);
			return null;
		}

		const tokens = (await response.json()) as {
			id_token?: string;
			access_token: string;
			refresh_token: string;
			expires_in?: number;
		};

		const accountId = extractAccountId(tokens) ?? connection.accountId ?? undefined;
		const email = extractEmail(tokens) ?? connection.email ?? undefined;

		// Update stored tokens
		await ctx.runMutation(internal.openai.storeTokens, {
			userId,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
			accountId,
			email
		});

		return {
			accessToken: tokens.access_token,
			accountId
		};
	}
});
