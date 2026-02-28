import { action } from './_generated/server';
import { v } from 'convex/values';

export const listAccounts = action({
	args: {
		dsn: v.string(),
		apiKey: v.string()
	},
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
	handler: async (_ctx, { dsn, apiKey }) => {
		const response = await fetch(`https://${dsn}/api/v1/accounts`, {
			method: 'GET',
			headers: { 'X-API-KEY': apiKey }
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Unipile API error: ${response.status} ${text}`);
		}

		const data = (await response.json()) as {
			items: Array<{
				id: string;
				name: string;
				type: string;
				created_at: string;
				sources: Array<{ id: string; status: string }>;
			}>;
		};

		return {
			items: data.items.map((item) => ({
				id: item.id,
				name: item.name ?? '',
				type: item.type ?? '',
				created_at: item.created_at ?? '',
				sources: (item.sources ?? []).map((s) => ({
					id: s.id,
					status: s.status
				}))
			}))
		};
	}
});

export const deleteAccount = action({
	args: {
		dsn: v.string(),
		apiKey: v.string(),
		accountId: v.string()
	},
	returns: v.object({ object: v.string() }),
	handler: async (_ctx, { dsn, apiKey, accountId }) => {
		const response = await fetch(`https://${dsn}/api/v1/accounts/${accountId}`, {
			method: 'DELETE',
			headers: { 'X-API-KEY': apiKey }
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Unipile API error: ${response.status} ${text}`);
		}

		const data = (await response.json()) as { object: string };
		return { object: data.object };
	}
});

export const getHostedAuthLink = action({
	args: {
		dsn: v.string(),
		apiKey: v.string(),
		siteUrl: v.string()
	},
	returns: v.object({ url: v.string() }),
	handler: async (_ctx, { dsn, apiKey, siteUrl }) => {
		const expiresOn = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

		const response = await fetch(`https://${dsn}/api/v1/hosted/accounts/link`, {
			method: 'POST',
			headers: {
				'X-API-KEY': apiKey,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				type: 'create',
				expiresOn,
				api_url: `https://${dsn}`,
				providers: '*',
				success_redirect_url: `${siteUrl}/app/my-tasks`,
				failure_redirect_url: `${siteUrl}/app/my-tasks`
			})
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Unipile API error: ${response.status} ${text}`);
		}

		const data = (await response.json()) as { url: string };
		return { url: data.url };
	}
});
