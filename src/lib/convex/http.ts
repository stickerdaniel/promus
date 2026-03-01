import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { authComponent, createAuth } from './auth';
import { resend } from './emails/resend';

const http = httpRouter();

// Better Auth routes
authComponent.registerRoutes(http, createAuth);

// Resend webhook endpoint
// Configure this URL in your Resend dashboard: https://your-deployment.convex.site/resend-webhook
// This endpoint receives email events (delivered, bounced, complained, opened, clicked)
http.route({
	path: '/resend-webhook',
	method: 'POST',
	handler: httpAction(async (ctx, req) => {
		return await resend.handleResendEventWebhook(ctx, req);
	})
});

// Unipile webhook endpoint — receives account connection callbacks
// Unipile sends a POST with the nonce (as `name`) and `account_id` after OAuth completes
http.route({
	path: '/unipile-webhook',
	method: 'POST',
	handler: httpAction(async (ctx, req) => {
		let name: string | undefined;
		let accountId: string | undefined;

		const contentType = req.headers.get('content-type') ?? '';

		try {
			if (contentType.includes('application/json')) {
				const body = (await req.json()) as Record<string, unknown>;
				name = body.name as string | undefined;
				accountId = (body.account_id ?? body.accountId) as string | undefined;
			} else {
				// Handle form-encoded
				const text = await req.text();
				const params = new URLSearchParams(text);
				name = params.get('name') ?? undefined;
				accountId = params.get('account_id') ?? params.get('accountId') ?? undefined;
			}
		} catch {
			return new Response('Bad request', { status: 400 });
		}

		if (!name) {
			return new Response('Missing name (nonce)', { status: 400 });
		}

		await ctx.runMutation(internal.unipileWebhook.receiveWebhook, {
			nonce: name,
			accountId
		});

		return new Response('OK', { status: 200 });
	})
});

export default http;
