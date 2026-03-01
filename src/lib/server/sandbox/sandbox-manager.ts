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
		autoStopInterval: 30,
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

	// 3. Upload Unipile SDK type hints so vibe gets autocomplete
	const unipileDts = `/** Pre-configured Unipile SDK client. Do NOT instantiate — use directly. */
declare const unipile: {
  account: {
    getAll(input?: { limit?: number; cursor?: string }): Promise<any>;
    getOne(accountId: string): Promise<any>;
  };
  messaging: {
    getAllChats(input?: { limit?: number; cursor?: string; account_id?: string; account_type?: string; unread?: boolean; before?: string; after?: string }): Promise<any>;
    getChat(chatId: string): Promise<any>;
    getAllMessagesFromChat(input: { chat_id: string; sender_id?: string; limit?: number; cursor?: string; before?: string; after?: string }): Promise<any>;
    getMessage(messageId: string): Promise<any>;
    getAllMessages(input?: { account_id?: string; sender_id?: string; limit?: number; cursor?: string; before?: string; after?: string }): Promise<any>;
    getAllMessagesFromAttendee(input: { attendee_id: string; limit?: number; cursor?: string; before?: string; after?: string }): Promise<any>;
    getAllChatsFromAttendee(input: { attendee_id: string; account_id?: string; limit?: number; cursor?: string; before?: string; after?: string }): Promise<any>;
    getMessageAttachment(input: { message_id: string; attachment_id: string }): Promise<Blob>;
    getAllAttendees(input?: { account_id?: string; limit?: number; cursor?: string }): Promise<any>;
    getAttendee(attendeeId: string): Promise<any>;
    sendMessage(input: { chat_id: string; text: string; thread_id?: string }): Promise<any>;
    startNewChat(input: { account_id: string; text: string; attendees_ids: string[]; subject?: string }): Promise<any>;
    setChatStatus(input: { chat_id: string; action: string; value: any }): Promise<any>;
  };
  email: {
    getAll(input?: { account_id?: string; role?: string; folder?: string; from?: string; to?: string; any_email?: string; limit?: number; cursor?: string; before?: string; after?: string }): Promise<any>;
    getOne(emailId: string): Promise<any>;
    getAllFolders(input?: { account_id?: string }): Promise<any>;
    getOneFolder(folderId: string): Promise<any>;
    getEmailAttachment(input: { email_id: string; attachment_id: string }): Promise<Blob>;
    send(input: { account_id: string; body: string; to: { email: string; display_name?: string }[]; subject?: string; cc?: object[]; bcc?: object[]; from?: object }): Promise<any>;
  };
  users: {
    getProfile(input: { account_id: string; identifier: string }): Promise<any>;
    getOwnProfile(accountId: string): Promise<any>;
    getAllRelations(input: { account_id: string; limit?: number; cursor?: string }): Promise<any>;
    getAllPosts(input: { account_id: string; identifier: string; is_company?: boolean; limit?: number; cursor?: string }): Promise<any>;
    getPost(input: { account_id: string; post_id: string }): Promise<any>;
    getAllPostComments(input: { account_id: string; post_id: string; limit?: number; cursor?: string }): Promise<any>;
    getCompanyProfile(input: { account_id: string; identifier: string }): Promise<any>;
    sendInvitation(input: { account_id: string; provider_id: string; message?: string }): Promise<any>;
    createPost(input: { account_id?: string; text: string }): Promise<any>;
    sendPostComment(input: { account_id: string; post_id: string; text: string }): Promise<any>;
  };
};
declare const console: { log(...args: any[]): void; warn(...args: any[]): void; error(...args: any[]): void };
declare function fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
declare function setTimeout(callback: () => void, ms?: number): number;
declare function clearTimeout(id: number): void;
`;
	await sandbox.fs.uploadFile(Buffer.from(unipileDts), '/root/unipile.d.ts');

	// 4. Upload tsconfig.json for LSP support
	const tsconfig = JSON.stringify(
		{
			compilerOptions: {
				target: 'ES2022',
				module: 'ESNext',
				moduleResolution: 'node',
				strict: true,
				noEmit: true,
				skipLibCheck: true
			},
			include: ['*.ts', '*.d.ts']
		},
		null,
		2
	);
	await sandbox.fs.uploadFile(Buffer.from(tsconfig), '/root/tsconfig.json');
	console.warn(
		`[sandbox.manager] uploaded config + env + types + tsconfig sandboxId=${sandbox.id}`
	);

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
