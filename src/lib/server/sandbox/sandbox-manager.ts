import { env } from '$env/dynamic/private';
import type { Sandbox } from '@daytonaio/sdk';
import { getDaytona } from './daytona';
import { VIBE_SERVER_SCRIPT } from './vibe-server-script';
import { getVibeConfigToml, type VibeLLMProvider } from './config-builder';
import type { SandboxCreateResult } from './types';

const VIBE_SERVER_PORT = 3000;
const HEALTH_POLL_INTERVAL_MS = 2000;
const HEALTH_POLL_MAX_RETRIES = 30;

function getProvider(): VibeLLMProvider {
	const p = env.VIBE_LLM_PROVIDER || 'bedrock';
	if (p !== 'bedrock' && p !== 'openrouter' && p !== 'mistral') {
		throw new Error(`Invalid VIBE_LLM_PROVIDER: ${p}. Must be bedrock, openrouter, or mistral`);
	}
	return p;
}

function getProxyUrl(): string {
	return env.VIBE_LLM_PROXY_URL || 'http://localhost:5173';
}

function truncateText(value: string | undefined, max = 240): string {
	if (!value) return '';
	if (value.length <= max) return value;
	return `${value.slice(0, max)}...`;
}

/**
 * Build sandbox env vars based on chosen LLM provider.
 * For bedrock: no AWS creds — only the proxy token. Creds stay server-side.
 */
function buildEnvVars(provider: VibeLLMProvider): Record<string, string> {
	const vars: Record<string, string> = {};

	if (provider === 'bedrock') {
		if (env.VIBE_LLM_PROXY_TOKEN) vars.LLM_PROXY_TOKEN = env.VIBE_LLM_PROXY_TOKEN;
	} else if (provider === 'openrouter') {
		if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required');
		vars.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
	} else if (provider === 'mistral') {
		if (!env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY is required');
		vars.MISTRAL_API_KEY = env.MISTRAL_API_KEY;
	}

	if (env.UNIPILE_API_KEY) vars.UNIPILE_API_KEY = env.UNIPILE_API_KEY;
	if (env.UNIPILE_DSN) vars.UNIPILE_DSN = env.UNIPILE_DSN;

	return vars;
}

/**
 * Create a new Daytona sandbox with vibe CLI and HTTP server pre-installed.
 */
export async function createSandbox(userId: string): Promise<SandboxCreateResult> {
	const provider = getProvider();
	const proxyUrl = getProxyUrl();
	const daytona = getDaytona();
	console.warn(
		`[sandbox.manager] createSandbox start userId=${userId} provider=${provider} proxyUrl=${proxyUrl}`
	);

	const envVars = buildEnvVars(provider);

	// 1. Create sandbox from pre-built snapshot (deps already installed)
	const sandbox = await daytona.create({
		snapshot: 'promus-vibe',
		envVars,
		public: true,
		autoStopInterval: 5,
		labels: { userId, app: 'promus-vibe' }
	});
	console.warn(`[sandbox.manager] sandbox created sandboxId=${sandbox.id} provider=${provider}`);

	// 2. Upload vibe server script
	await sandbox.fs.uploadFile(Buffer.from(VIBE_SERVER_SCRIPT), '/home/daytona/vibe-server.py');

	// 3. Upload vibe config
	await sandbox.process.executeCommand('mkdir -p /home/daytona/.vibe');
	await sandbox.fs.uploadFile(
		Buffer.from(getVibeConfigToml(provider, { proxyUrl })),
		'/home/daytona/.vibe/config.toml'
	);
	console.warn(`[sandbox.manager] uploaded config sandboxId=${sandbox.id}`);

	// 4. Start vibe server as background session
	await sandbox.process.createSession('vibe-server');
	const vibeSessionCommand = await sandbox.process.executeSessionCommand('vibe-server', {
		command: 'python /home/daytona/vibe-server.py',
		runAsync: true
	});
	console.warn(
		`[sandbox.manager] vibe server session started sandboxId=${sandbox.id} cmdId=${vibeSessionCommand.cmdId ?? 'unknown'}`
	);

	// 5. Health poll vibe server
	await pollHealth(sandbox, vibeSessionCommand.cmdId);

	// 6. Get preview link
	const preview = await sandbox.getPreviewLink(VIBE_SERVER_PORT);
	console.warn(
		`[sandbox.manager] preview link ready sandboxId=${sandbox.id} previewUrl=${preview.url}`
	);

	return {
		sandboxId: sandbox.id,
		previewUrl: preview.url,
		previewToken: preview.token || ''
	};
}

/**
 * Ensure a sandbox is ready, restarting it if stopped.
 */
export async function ensureSandboxReady(sandboxId: string): Promise<SandboxCreateResult> {
	const daytona = getDaytona();
	console.warn(`[sandbox.manager] ensureSandboxReady start sandboxId=${sandboxId}`);
	const sandbox = await daytona.get(sandboxId);
	await sandbox.refreshData();
	console.warn(`[sandbox.manager] sandbox state sandboxId=${sandbox.id} state=${sandbox.state}`);

	if (sandbox.state === 'started') {
		await pollHealth(sandbox);
		const preview = await sandbox.getPreviewLink(VIBE_SERVER_PORT);
		console.warn(
			`[sandbox.manager] sandbox already ready sandboxId=${sandbox.id} previewUrl=${preview.url}`
		);
		return {
			sandboxId: sandbox.id,
			previewUrl: preview.url,
			previewToken: preview.token || ''
		};
	}

	if (sandbox.state === 'stopped') {
		await sandbox.start(120);
		console.warn(`[sandbox.manager] sandbox started from stopped state sandboxId=${sandbox.id}`);

		// Restart vibe-server session
		try {
			await sandbox.process.createSession('vibe-server');
		} catch {
			// Session might already exist
		}
		const vibeSessionCommand = await sandbox.process.executeSessionCommand('vibe-server', {
			command: 'python /home/daytona/vibe-server.py',
			runAsync: true
		});
		console.warn(
			`[sandbox.manager] vibe server restarted sandboxId=${sandbox.id} cmdId=${vibeSessionCommand.cmdId ?? 'unknown'}`
		);

		await pollHealth(sandbox, vibeSessionCommand.cmdId);
		const preview = await sandbox.getPreviewLink(VIBE_SERVER_PORT);
		console.warn(
			`[sandbox.manager] sandbox resumed sandboxId=${sandbox.id} previewUrl=${preview.url}`
		);
		return {
			sandboxId: sandbox.id,
			previewUrl: preview.url,
			previewToken: preview.token || ''
		};
	}

	throw new Error(`Sandbox ${sandboxId} is in state "${sandbox.state}" and cannot be resumed`);
}

/**
 * Stop a sandbox (best-effort).
 */
export async function stopSandbox(sandboxId: string): Promise<void> {
	const daytona = getDaytona();
	const sandbox = await daytona.get(sandboxId);
	console.warn(`[sandbox.manager] stop sandbox sandboxId=${sandbox.id}`);
	await sandbox.stop();
	console.warn(`[sandbox.manager] sandbox stopped sandboxId=${sandbox.id}`);
}

/**
 * Delete a sandbox (best-effort).
 */
export async function deleteSandbox(sandboxId: string): Promise<void> {
	const daytona = getDaytona();
	const sandbox = await daytona.get(sandboxId);
	console.warn(`[sandbox.manager] delete sandbox sandboxId=${sandbox.id}`);
	await sandbox.delete();
	console.warn(`[sandbox.manager] sandbox deleted sandboxId=${sandbox.id}`);
}

async function pollHealth(sandbox: Sandbox, commandId?: string): Promise<void> {
	for (let i = 0; i < HEALTH_POLL_MAX_RETRIES; i++) {
		try {
			const result = await sandbox.process.executeCommand(
				`curl -sf http://localhost:${VIBE_SERVER_PORT}/health`
			);
			if (result.exitCode === 0) {
				console.warn(`[sandbox.manager] healthcheck ok sandboxId=${sandbox.id} attempts=${i + 1}`);
				return;
			}
			console.warn(
				`[sandbox.manager] healthcheck non-zero sandboxId=${sandbox.id} attempt=${i + 1}/${HEALTH_POLL_MAX_RETRIES} exitCode=${result.exitCode}`
			);
		} catch {
			console.warn(
				`[sandbox.manager] healthcheck failed sandboxId=${sandbox.id} attempt=${i + 1}/${HEALTH_POLL_MAX_RETRIES}`
			);
		}
		await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS));
	}
	if (commandId) {
		try {
			const logs = await sandbox.process.getSessionCommandLogs('vibe-server', commandId);
			const logOutput =
				typeof logs === 'string'
					? logs
					: ((logs as { output?: string; stdout?: string; stderr?: string }).output ??
						(logs as { stdout?: string }).stdout ??
						(logs as { stderr?: string }).stderr ??
						'');
			console.error(
				`[sandbox.manager] healthcheck timeout sandboxId=${sandbox.id} cmdId=${commandId} logsTail=${JSON.stringify(truncateText(logOutput, 2000))}`
			);
		} catch (e) {
			console.error(
				`[sandbox.manager] failed to fetch session logs sandboxId=${sandbox.id} cmdId=${commandId} error=${e instanceof Error ? e.message : String(e)}`
			);
		}
	}
	throw new Error('Vibe server health check timed out');
}
