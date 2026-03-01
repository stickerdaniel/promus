import { json, error } from '@sveltejs/kit';
import type { RequestHandler, RequestEvent } from './$types';
import { env } from '$env/dynamic/private';
import { getDaytona } from '$lib/server/sandbox/daytona';
import { ensureSandboxReady } from '$lib/server/sandbox';
import { executeScript } from '$lib/server/sandbox/script-executor';
import { buildVibePrompt } from '$lib/server/sandbox/vibe-prompt-builder';

export const config = { maxDuration: 60 };

const TASK_FILE = '/root/task.ts';
const VIBE_TIMEOUT = 40;

/**
 * POST /api/sandbox/run-internal — Internal endpoint for agent-triggered vibe execution.
 *
 * Authenticates via X-Internal-Key header (shared secret) instead of user session.
 * Accepts sandboxId + prompt directly — no session lookup or thread message saving.
 *
 * Flow:
 * 1. Validate internal key
 * 2. Execute vibe with augmented prompt
 * 3. Check if vibe wrote /root/task.ts — if so, download + execute server-side
 * 4. Return combined result
 */
export const POST: RequestHandler = async ({ request }: RequestEvent) => {
	const internalKey = request.headers.get('x-internal-key');
	if (!internalKey || internalKey !== env.SANDBOX_INTERNAL_API_KEY) {
		error(401, 'Invalid internal key');
	}

	const { sandboxId, prompt, maxTurns = 2 } = await request.json();
	if (!sandboxId || !prompt) {
		error(400, 'sandboxId and prompt are required');
	}

	// Ensure sandbox is running (may have auto-stopped)
	await ensureSandboxReady(sandboxId);

	const daytona = getDaytona();
	const sandbox = await daytona.get(sandboxId);

	// Execute vibe with augmented prompt
	const augmentedPrompt = buildVibePrompt(prompt);
	const cmd = `. /root/.vibe-env && vibe -p ${JSON.stringify(augmentedPrompt)} --output json --max-turns ${maxTurns} 2>&1`;
	console.warn(`[sandbox.run-internal] executing sandboxId=${sandboxId} cmd_len=${cmd.length}`);

	let vibeOutput: string;
	let exitCode: number;

	try {
		const result = await sandbox.process.executeCommand(cmd, undefined, undefined, VIBE_TIMEOUT);
		vibeOutput =
			(result as { result?: string; output?: string }).result ??
			(result as { output?: string }).output ??
			'';
		exitCode = result.exitCode;
		console.warn(
			`[sandbox.run-internal] vibe done sandboxId=${sandboxId} exit=${exitCode} output_len=${vibeOutput.length}`
		);
	} catch (e) {
		console.error(
			`[sandbox.run-internal] vibe error: ${e instanceof Error ? e.message : String(e)}`
		);
		vibeOutput = e instanceof Error ? e.message : 'Execution failed';
		exitCode = -1;
	}

	const vibeContent = vibeOutput.trim() || `Vibe exited with code ${exitCode} (no output)`;

	// Check for /root/task.ts and execute if present
	let scriptResult: { success: boolean; output: string; error?: string } | null = null;

	if (env.UNIPILE_DSN && env.UNIPILE_API_KEY) {
		try {
			const taskBuffer = await sandbox.fs.downloadFile(TASK_FILE);
			const tsSource = taskBuffer.toString('utf-8');
			console.warn(`[sandbox.run-internal] found task.ts (${tsSource.length} bytes), executing...`);

			const result = await executeScript(tsSource, env.UNIPILE_DSN, env.UNIPILE_API_KEY);
			scriptResult = {
				success: result.success,
				output: result.output,
				error: result.error
			};

			console.warn(
				`[sandbox.run-internal] script done success=${result.success} duration=${result.durationMs}ms`
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (!msg.includes('404') && !msg.includes('not found') && !msg.includes('No such file')) {
				console.warn(`[sandbox.run-internal] task.ts download/exec error: ${msg}`);
			}
		}

		// Cleanup task.ts (best-effort)
		try {
			await sandbox.process.executeCommand(`rm -f ${TASK_FILE}`, undefined, undefined, 5);
		} catch {
			// ignore cleanup errors
		}
	}

	return json({
		exitCode,
		vibeOutput: vibeContent,
		scriptResult
	});
};
