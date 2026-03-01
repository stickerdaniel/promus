import { env } from '$env/dynamic/private';
import { getDaytona } from './daytona';
import { getVibeConfigToml } from './config-builder';
import type { SandboxCreateResult } from './types';

/**
 * Create a new Daytona sandbox with vibe CLI pre-installed.
 * Uses OpenRouter for LLM access (whitelisted by Daytona).
 *
 * Vibe is executed via Daytona SDK `executeCommand` from SvelteKit —
 * no in-sandbox HTTP server needed.
 */
export async function createSandbox(userId: string): Promise<SandboxCreateResult> {
	if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required');

	const daytona = getDaytona();
	console.warn(`[sandbox.manager] createSandbox start userId=${userId}`);

	const envVars: Record<string, string> = {
		OPENROUTER_API_KEY: env.OPENROUTER_API_KEY
	};
	if (env.UNIPILE_API_KEY) envVars.UNIPILE_API_KEY = env.UNIPILE_API_KEY;
	if (env.UNIPILE_DSN) envVars.UNIPILE_DSN = env.UNIPILE_DSN;

	// 1. Create sandbox from pre-built snapshot
	const sandbox = await daytona.create({
		snapshot: 'promus-vibe',
		envVars,
		public: true,
		autoStopInterval: 5,
		labels: { userId, app: 'promus-vibe' }
	});
	console.warn(`[sandbox.manager] sandbox created sandboxId=${sandbox.id}`);

	// 2. Upload vibe config + env file
	const vibeConfig = Buffer.from(getVibeConfigToml());
	await sandbox.process.executeCommand('mkdir -p /root/.vibe /home/daytona/.vibe');
	await sandbox.fs.uploadFile(vibeConfig, '/root/.vibe/config.toml');
	await sandbox.fs.uploadFile(vibeConfig, '/home/daytona/.vibe/config.toml');

	const envFileContent = Object.entries(envVars)
		.map(([k, v]) => `export ${k}="${v}"`)
		.join('\n');
	await sandbox.fs.uploadFile(Buffer.from(envFileContent), '/root/.vibe-env');
	console.warn(`[sandbox.manager] uploaded config + env sandboxId=${sandbox.id}`);

	return { sandboxId: sandbox.id, previewUrl: '', previewToken: '' };
}

/**
 * Ensure a sandbox is ready, restarting it if stopped.
 */
export async function ensureSandboxReady(sandboxId: string): Promise<SandboxCreateResult> {
	const daytona = getDaytona();
	const sandbox = await daytona.get(sandboxId);
	await sandbox.refreshData();
	console.warn(
		`[sandbox.manager] ensureSandboxReady sandboxId=${sandbox.id} state=${sandbox.state}`
	);

	if (sandbox.state === 'started') {
		return { sandboxId: sandbox.id, previewUrl: '', previewToken: '' };
	}

	if (sandbox.state === 'stopped') {
		await sandbox.start(120);
		console.warn(`[sandbox.manager] resumed sandboxId=${sandbox.id}`);
		return { sandboxId: sandbox.id, previewUrl: '', previewToken: '' };
	}

	throw new Error(`Sandbox ${sandboxId} is in state "${sandbox.state}" and cannot be resumed`);
}

export async function stopSandbox(sandboxId: string): Promise<void> {
	const daytona = getDaytona();
	const sandbox = await daytona.get(sandboxId);
	await sandbox.stop();
	console.warn(`[sandbox.manager] stopped sandboxId=${sandbox.id}`);
}

export async function deleteSandbox(sandboxId: string): Promise<void> {
	const daytona = getDaytona();
	const sandbox = await daytona.get(sandboxId);
	await sandbox.delete();
	console.warn(`[sandbox.manager] deleted sandboxId=${sandbox.id}`);
}
