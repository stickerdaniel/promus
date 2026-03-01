import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { executeScript } from '$lib/server/sandbox/script-executor';

/**
 * POST /api/sandbox/execute — Execute Unipile SDK code in a sandboxed VM.
 *
 * Auth: x-internal-key header (SANDBOX_INTERNAL_API_KEY).
 * Body: { code: string }
 * Returns: ExecutionResult as JSON.
 */
export const POST: RequestHandler = async ({ request }) => {
	const internalKey = request.headers.get('x-internal-key');
	if (!internalKey || internalKey !== env.SANDBOX_INTERNAL_API_KEY) {
		error(401, 'Invalid internal key');
	}

	const { code, allowedAccountIds } = await request.json();
	if (!code || typeof code !== 'string') {
		error(400, 'code is required');
	}
	if (
		!Array.isArray(allowedAccountIds) ||
		!allowedAccountIds.every((id: unknown) => typeof id === 'string')
	) {
		error(400, 'allowedAccountIds must be a string[]');
	}

	if (!env.UNIPILE_DSN || !env.UNIPILE_API_KEY) {
		error(500, 'UNIPILE_DSN or UNIPILE_API_KEY not configured');
	}

	const result = await executeScript(
		code,
		env.UNIPILE_DSN,
		env.UNIPILE_API_KEY,
		allowedAccountIds as string[]
	);
	return json(result);
};
