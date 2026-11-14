import type { PageServerLoad } from './$types';
import { api } from '$lib/convex/_generated/api.js';
import { PUBLIC_CONVEX_URL } from '$app/env/public';
import { createConvexHttpClient } from '@mmailaender/convex-better-auth-svelte/sveltekit';

export const load = (async (event) => {
	const client = createConvexHttpClient({
		token: event.locals.token,
		convexUrl: PUBLIC_CONVEX_URL
	});

	const user = await client.query(api.users.viewer, {});
	return {
		user
	};
}) satisfies PageServerLoad;
