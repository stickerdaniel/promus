import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** GET /api/sandbox/llm — health check */
export const GET: RequestHandler = async () => {
	return json({ status: 'ok' });
};
