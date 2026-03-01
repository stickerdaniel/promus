import { json, error } from '@sveltejs/kit';
import type { RequestHandler, RequestEvent } from './$types';
import { env } from '$env/dynamic/private';
import { getDaytona } from '$lib/server/sandbox/daytona';
import { executeScript } from '$lib/server/sandbox/script-executor';
import { buildVibePrompt } from '$lib/server/sandbox/vibe-prompt-builder';
import { createConvexHttpClient } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { api } from '$lib/convex/_generated/api';

export const config = { maxDuration: 60 };

const TASK_FILE = '/root/task.ts';
const VIBE_TIMEOUT = 40;

/**
 * POST /api/sandbox/run — Execute vibe in sandbox, then run any generated script.
 *
 * Flow:
 * 1. Look up user's sandbox session
 * 2. Execute vibe with augmented prompt (includes Unipile context)
 * 3. Save vibe's conversational response
 * 4. Check if vibe wrote /root/task.ts — if so, download + execute it server-side
 * 5. Save script execution result as follow-up message
 * 6. Cleanup task.ts
 */
export const POST: RequestHandler = async ({ request, locals }: RequestEvent) => {
	if (!locals.token) {
		error(401, 'Authentication required');
	}

	const { threadId, prompt, maxTurns = 2 } = await request.json();
	if (!threadId || !prompt) {
		error(400, 'threadId and prompt are required');
	}

	const client = createConvexHttpClient({ token: locals.token });

	// 1. Look up user's sandbox session
	const session = await client.query(api.sandboxApi.getSession, {});
	if (!session || session.status !== 'ready') {
		error(400, 'No ready sandbox session found');
	}

	const daytona = getDaytona();
	const sandbox = await daytona.get(session.sandboxId);

	// 2. Execute vibe with augmented prompt
	const augmentedPrompt = buildVibePrompt(prompt);
	const cmd = `. /root/.vibe-env && vibe -p ${JSON.stringify(augmentedPrompt)} --output json --max-turns ${maxTurns} 2>&1`;
	console.warn(`[sandbox.run] executing sandboxId=${session.sandboxId} cmd_len=${cmd.length}`);

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
			`[sandbox.run] vibe done sandboxId=${session.sandboxId} exit=${exitCode} output_len=${vibeOutput.length}`
		);
	} catch (e) {
		console.error(`[sandbox.run] vibe error: ${e instanceof Error ? e.message : String(e)}`);
		vibeOutput = e instanceof Error ? e.message : 'Execution failed';
		exitCode = -1;
	}

	// 3. Save vibe's conversational response
	const MAX_MSG = 800_000;
	const vibeContent = vibeOutput.trim() || `Vibe exited with code ${exitCode} (no output)`;
	const truncatedVibe =
		vibeContent.length > MAX_MSG
			? vibeContent.slice(0, MAX_MSG) + '\n\n[Output truncated]'
			: vibeContent;

	await client.mutation(api.sandboxApi.saveAssistantMessage, {
		threadId,
		content: truncatedVibe
	});
	console.warn(`[sandbox.run] saved vibe message threadId=${threadId}`);

	// 4. Check for /root/task.ts and execute if present
	let scriptResult: { success: boolean; output: string; error?: string } | null = null;

	if (env.UNIPILE_DSN && env.UNIPILE_API_KEY) {
		try {
			const taskBuffer = await sandbox.fs.downloadFile(TASK_FILE);
			const tsSource = taskBuffer.toString('utf-8');
			console.warn(`[sandbox.run] found task.ts (${tsSource.length} bytes), executing...`);

			const result = await executeScript(tsSource, env.UNIPILE_DSN, env.UNIPILE_API_KEY);
			scriptResult = {
				success: result.success,
				output: result.output,
				error: result.error
			};

			console.warn(
				`[sandbox.run] script done success=${result.success} duration=${result.durationMs}ms`
			);

			// 5. Save script result as follow-up assistant message
			const scriptContent = result.success
				? `**Script Output:**\n\`\`\`\n${result.output}\n\`\`\``
				: `**Script Error:**\n\`\`\`\n${result.error}\n\`\`\`${result.output ? `\n\n**Logs:**\n\`\`\`\n${result.output}\n\`\`\`` : ''}`;

			const truncatedScript =
				scriptContent.length > MAX_MSG
					? scriptContent.slice(0, MAX_MSG) + '\n\n[Output truncated]'
					: scriptContent;

			await client.mutation(api.sandboxApi.saveAssistantMessage, {
				threadId,
				content: truncatedScript
			});
			console.warn(`[sandbox.run] saved script result message threadId=${threadId}`);
		} catch (e) {
			// File doesn't exist or download failed — that's fine, vibe didn't write a script
			const msg = e instanceof Error ? e.message : String(e);
			if (!msg.includes('404') && !msg.includes('not found') && !msg.includes('No such file')) {
				console.warn(`[sandbox.run] task.ts download/exec error: ${msg}`);
			}
		}

		// 6. Cleanup task.ts (best-effort)
		try {
			await sandbox.process.executeCommand(`rm -f ${TASK_FILE}`, undefined, undefined, 5);
		} catch {
			// ignore cleanup errors
		}
	}

	return json({
		exitCode,
		output: truncatedVibe,
		scriptResult
	});
};
