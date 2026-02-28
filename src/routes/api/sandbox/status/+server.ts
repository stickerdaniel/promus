import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { api } from '$lib/convex/_generated/api';
import { createConvexHttpClient } from '@mmailaender/convex-better-auth-svelte/sveltekit';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.token) {
		error(401, 'Authentication required');
	}

	const client = createConvexHttpClient({ token: locals.token });
	const session = await client.query(api.sandboxApi.getSession, {});

	if (!session) {
		return json({ status: 'none' });
	}

	return json({
		status: session.status,
		sandboxId: session.sandboxId,
		lastActiveAt: session.lastActiveAt,
		errorMessage: session.errorMessage
	});
};
