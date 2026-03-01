import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDaytona } from '$lib/server/sandbox/daytona';
import { createConvexHttpClient } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { api } from '$lib/convex/_generated/api';

/**
 * POST /api/sandbox/run — Execute vibe in sandbox and save assistant response.
 *
 * The user message is already saved by the frontend (via Convex sendMessage mutation
 * with optimistic update). This route:
 * 1. Looks up user's sandbox session
 * 2. Executes vibe via Daytona SDK executeCommand
 * 3. Saves the assistant response to the Convex thread
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.token) {
		error(401, 'Authentication required');
	}

	const { threadId, prompt, maxTurns = 2, timeout = 60 } = await request.json();
	if (!threadId || !prompt) {
		error(400, 'threadId and prompt are required');
	}

	const client = createConvexHttpClient({ token: locals.token });

	// 1. Look up user's sandbox session
	const session = await client.query(api.sandboxApi.getSession, {});
	if (!session || session.status !== 'ready') {
		error(400, 'No ready sandbox session found');
	}

	// 2. Execute vibe via Daytona SDK
	const daytona = getDaytona();
	const sandbox = await daytona.get(session.sandboxId);

	const cmd = `. /root/.vibe-env && vibe -p ${JSON.stringify(prompt)} --output json --max-turns ${maxTurns} 2>&1`;
	console.warn(`[sandbox.run] executing sandboxId=${session.sandboxId} cmd=${cmd.slice(0, 120)}`);

	let output: string;
	let exitCode: number;

	try {
		const result = await sandbox.process.executeCommand(cmd, undefined, undefined, timeout);
		output =
			(result as { result?: string; output?: string }).result ??
			(result as { output?: string }).output ??
			'';
		exitCode = result.exitCode;
		console.warn(
			`[sandbox.run] done sandboxId=${session.sandboxId} exit=${exitCode} output_len=${output.length}`
		);
	} catch (e) {
		console.error(`[sandbox.run] exec error: ${e instanceof Error ? e.message : String(e)}`);
		output = e instanceof Error ? e.message : 'Execution failed';
		exitCode = -1;
	}

	// 3. Save assistant response to Convex thread
	const MAX_MSG = 800_000;
	const content = output.trim() || `Vibe exited with code ${exitCode} (no output)`;
	const truncated =
		content.length > MAX_MSG ? content.slice(0, MAX_MSG) + '\n\n[Output truncated]' : content;

	await client.mutation(api.sandboxApi.saveAssistantMessage, {
		threadId,
		content: truncated
	});
	console.warn(`[sandbox.run] saved assistant message threadId=${threadId}`);

	return json({ exitCode, output: truncated });
};
