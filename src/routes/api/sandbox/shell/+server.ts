import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { execInSession } from '$lib/server/sandbox/shell-session';

/**
 * POST /api/sandbox/shell — Execute a command in a sandboxed just-bash session.
 *
 * Auth: x-internal-key header (SANDBOX_INTERNAL_API_KEY).
 * Body: { sessionId, command, allowedAccountIds, savedScripts? }
 * Returns: { stdout, stderr, exitCode }
 */
export const POST: RequestHandler = async ({ request }) => {
	const internalKey = request.headers.get('x-internal-key');
	if (!internalKey || internalKey !== env.SANDBOX_INTERNAL_API_KEY) {
		error(401, 'Invalid internal key');
	}

	const body = await request.json();
	const { sessionId, command, savedScripts } = body;

	if (!sessionId || typeof sessionId !== 'string') {
		error(400, 'sessionId is required');
	}
	if (!command || typeof command !== 'string') {
		error(400, 'command is required');
	}

	const rawIds = body.allowedAccountIds;
	const allowedAccountIds: string[] =
		Array.isArray(rawIds) && rawIds.every((id: unknown) => typeof id === 'string')
			? (rawIds as string[])
			: [];

	const parsedScripts: Record<string, string> | undefined =
		savedScripts && typeof savedScripts === 'object' && !Array.isArray(savedScripts)
			? (savedScripts as Record<string, string>)
			: undefined;

	const result = await execInSession(sessionId, command, {
		allowedAccountIds,
		savedScripts: parsedScripts
	});

	return json(result);
};
