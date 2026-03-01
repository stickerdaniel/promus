import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

function validateToken(request: Request) {
	const token = env.VIBE_LLM_PROXY_TOKEN;
	if (!token) return;
	const auth = request.headers.get('authorization');
	if (auth !== `Bearer ${token}`) {
		error(401, 'Invalid proxy token');
	}
}

/** POST — pass-through proxy to Mistral API. Sandbox can't reach external APIs directly. */
export const POST: RequestHandler = async ({ request }) => {
	validateToken(request);

	if (!env.MISTRAL_API_KEY) {
		error(500, 'MISTRAL_API_KEY not configured');
	}

	const body = await request.text();

	console.warn(`[llm-proxy] forwarding to Mistral API`);

	const response = await fetch(MISTRAL_API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${env.MISTRAL_API_KEY}`
		},
		body
	});

	const data = await response.text();

	return new Response(data, {
		status: response.status,
		headers: { 'Content-Type': 'application/json' }
	});
};
