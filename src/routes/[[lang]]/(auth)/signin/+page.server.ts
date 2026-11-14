import type { PageServerLoad } from './$types';
import { api } from '$lib/convex/_generated/api.js';
import { PUBLIC_CONVEX_URL } from '$app/env/public';
import { createConvexHttpClient } from '@mmailaender/convex-better-auth-svelte/sveltekit';

export const load = (async () => {
	const client = createConvexHttpClient({ convexUrl: PUBLIC_CONVEX_URL });
	const oauthProviders = await client.query(api.auth.getAvailableOAuthProviders, {});
	return { oauthProviders };
}) satisfies PageServerLoad;
