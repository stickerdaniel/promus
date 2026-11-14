import { defineEnvVars } from '@sveltejs/kit/env';

/** Reads an unset or empty variable as `undefined` instead of rejecting it at startup. */
const optional = (value: string | undefined) => value || undefined;

/**
 * The variables SvelteKit exposes through `$app/env/public` and `$app/env/private`.
 *
 * Static public variables are inlined at build time. The others are read when the app starts.
 * Variables without a schema must be set.
 */
export const variables = defineEnvVars({
	PUBLIC_CONVEX_URL: { public: true, static: true },
	PUBLIC_CONVEX_SITE_URL: { public: true, static: true },
	PUBLIC_POSTHOG_API_KEY: { public: true, schema: optional },
	PUBLIC_POSTHOG_HOST: { public: true, schema: optional },
	PUBLIC_POSTHOG_PROXY_HOST: { public: true, schema: optional },
	PUBLIC_SNAPDOM_PROXY_URL: { public: true, schema: optional },
	SANDBOX_INTERNAL_API_KEY: { schema: optional },
	UNIPILE_DSN: { schema: optional },
	UNIPILE_API_KEY: { schema: optional },
	RESEND_API_KEY: { schema: optional }
});
