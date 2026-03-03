import { Bash, defineCommand, InMemoryFs } from 'just-bash';
import { executeScript } from './script-executor.js';
import { sdkFiles } from './sdk-bundle.js';

export interface ShellSessionConfig {
	allowedAccountIds: string[];
	/** Saved scripts as slug → code, pre-populated into /scripts/ */
	savedScripts?: Record<string, string>;
}

interface SessionEntry {
	bash: Bash;
	config: ShellSessionConfig;
	lastAccess: number;
}

const SESSION_TTL_MS = 5 * 60_000; // 5 minutes
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute

const sessions = new Map<string, SessionEntry>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
	if (cleanupTimer) return;
	cleanupTimer = setInterval(() => {
		const now = Date.now();
		for (const [id, entry] of sessions) {
			if (now - entry.lastAccess > SESSION_TTL_MS) {
				sessions.delete(id);
			}
		}
		if (sessions.size === 0 && cleanupTimer) {
			clearInterval(cleanupTimer);
			cleanupTimer = null;
		}
	}, CLEANUP_INTERVAL_MS);
}

/**
 * Build the `execute-ts` custom command.
 * Reads a script from the virtual FS and runs it through the existing executeScript() sandbox.
 */
function buildExecuteTsCommand(config: ShellSessionConfig) {
	return defineCommand('execute-ts', async (args, ctx) => {
		const filePath = args[0];
		if (!filePath) {
			return { stdout: '', stderr: 'Usage: execute-ts <script-path>\n', exitCode: 1 };
		}

		let code: string;
		try {
			code = await ctx.fs.readFile(filePath);
		} catch {
			return { stdout: '', stderr: `File not found: ${filePath}\n`, exitCode: 1 };
		}

		const dsn = process.env.UNIPILE_DSN;
		const apiKey = process.env.UNIPILE_API_KEY;
		if (!dsn || !apiKey) {
			return {
				stdout: '',
				stderr: 'UNIPILE_DSN or UNIPILE_API_KEY not configured\n',
				exitCode: 1
			};
		}

		const result = await executeScript(code, dsn, apiKey, config.allowedAccountIds);

		const stdout = result.output || '';
		const stderr = result.error || '';
		return {
			stdout: stdout ? stdout + '\n' : '',
			stderr: stderr ? stderr + '\n' : '',
			exitCode: result.success ? 0 : 1
		};
	});
}

/** Create a new just-bash session with bundled SDK files. */
function createSession(config: ShellSessionConfig): Bash {
	const initialFiles: Record<string, string> = {
		'/workspace/.keep': ''
	};

	// Populate SDK source files (bundled at build time via Vite glob)
	for (const [path, content] of Object.entries(sdkFiles)) {
		initialFiles[`/sdk${path}`] = content;
	}

	if (config.savedScripts) {
		for (const [slug, code] of Object.entries(config.savedScripts)) {
			initialFiles[`/scripts/${slug}.ts`] = code;
		}
	}

	const fs = new InMemoryFs(initialFiles);
	const executeTsCmd = buildExecuteTsCommand(config);

	return new Bash({
		fs,
		cwd: '/workspace',
		customCommands: [executeTsCmd],
		env: {
			USER_ACCOUNT_IDS: JSON.stringify(config.allowedAccountIds)
		}
	});
}

/** Check if two configs have the same allowedAccountIds. */
function configMatches(a: ShellSessionConfig, b: ShellSessionConfig): boolean {
	const sortedA = [...a.allowedAccountIds].sort();
	const sortedB = [...b.allowedAccountIds].sort();
	return sortedA.length === sortedB.length && sortedA.every((id, i) => id === sortedB[i]);
}

/** Get or create a session for the given ID. Recreates if allowedAccountIds changed. */
export function getOrCreateSession(sessionId: string, config: ShellSessionConfig): Bash {
	const existing = sessions.get(sessionId);
	if (existing) {
		if (configMatches(existing.config, config)) {
			existing.lastAccess = Date.now();
			return existing.bash;
		}
		// Config changed — delete stale session and create fresh
		sessions.delete(sessionId);
	}

	const bash = createSession(config);
	sessions.set(sessionId, { bash, config, lastAccess: Date.now() });
	startCleanup();
	return bash;
}

/** Run a command in a session (sandboxed virtual FS, not child_process). */
export async function execInSession(
	sessionId: string,
	command: string,
	config: ShellSessionConfig
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const bash = getOrCreateSession(sessionId, config);
	// bash.exec runs in just-bash's sandboxed virtual filesystem, not child_process
	const result = await bash.exec(command);
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.exitCode
	};
}
