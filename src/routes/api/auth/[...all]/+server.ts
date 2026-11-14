import { PUBLIC_CONVEX_SITE_URL } from '$app/env/public';
import { createSvelteKitHandler } from '@mmailaender/convex-better-auth-svelte/sveltekit';

export const { GET, POST } = createSvelteKitHandler({ convexSiteUrl: PUBLIC_CONVEX_SITE_URL });
