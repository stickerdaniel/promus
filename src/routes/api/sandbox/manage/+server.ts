import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { api } from '$lib/convex/_generated/api';
import { createConvexHttpClient } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { createSandbox, ensureSandboxReady, stopSandbox, deleteSandbox } from '$lib/server/sandbox';
import { randomUUID } from 'node:crypto';

function previewError(err: unknown): string {
	if (err instanceof Error) return `${err.name}: ${err.message}`;
	return String(err);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.token) {
		error(401, 'Authentication required');
	}

	const reqId = randomUUID().slice(0, 8);
	const { action } = await request.json();
	if (!action || !['start', 'stop', 'delete'].includes(action)) {
		error(400, 'action must be "start", "stop", or "delete"');
	}
	console.warn(`[sandbox.manage:${reqId}] action=${action}`);

	const client = createConvexHttpClient({ token: locals.token });

	if (action === 'start') {
		// Create or resume sandbox + create agent thread
		let session = await client.query(api.sandboxApi.getSession, {});
		console.warn(
			`[sandbox.manage:${reqId}] currentSession=${session ? `${session._id}:${session.status}` : 'none'}`
		);

		if (!session || session.status === 'deleted') {
			// Create new session placeholder
			console.warn(`[sandbox.manage:${reqId}] creating placeholder session`);
			await client.mutation(api.sandboxApi.createSession, {
				sandboxId: 'pending',
				status: 'creating'
			});
			session = await client.query(api.sandboxApi.getSession, {});
			if (!session) error(500, 'Failed to create session');
			console.warn(`[sandbox.manage:${reqId}] placeholderSessionId=${session._id}`);

			try {
				console.warn(
					`[sandbox.manage:${reqId}] creating Daytona sandbox for user=${session.userId}`
				);
				const result = await createSandbox(session.userId);
				console.warn(
					`[sandbox.manage:${reqId}] sandboxCreated sandboxId=${result.sandboxId} previewUrl=${result.previewUrl}`
				);

				// Create agent thread for chat
				const { threadId } = await client.mutation(api.sandboxApi.createThread, {});
				console.warn(`[sandbox.manage:${reqId}] threadCreated threadId=${threadId}`);

				await client.mutation(api.sandboxApi.updateSession, {
					sessionId: session._id,
					status: 'ready',
					sandboxId: result.sandboxId,
					previewUrl: result.previewUrl,
					previewToken: result.previewToken,
					threadId
				});
				console.warn(
					`[sandbox.manage:${reqId}] sessionReady sessionId=${session._id} sandboxId=${result.sandboxId}`
				);
			} catch (e) {
				console.error(`[sandbox.manage:${reqId}] createFailed ${previewError(e)}`);
				await client.mutation(api.sandboxApi.updateSession, {
					sessionId: session._id,
					status: 'error',
					errorMessage: e instanceof Error ? e.message : 'Unknown error'
				});
				error(500, 'Failed to create sandbox');
			}
		} else if (session.status === 'stopped') {
			try {
				console.warn(`[sandbox.manage:${reqId}] resuming sandbox sandboxId=${session.sandboxId}`);
				const result = await ensureSandboxReady(session.sandboxId);
				console.warn(
					`[sandbox.manage:${reqId}] sandboxResumed sandboxId=${result.sandboxId} previewUrl=${result.previewUrl}`
				);

				// Create thread if none exists
				let threadId = session.threadId;
				if (!threadId) {
					const thread = await client.mutation(api.sandboxApi.createThread, {});
					threadId = thread.threadId;
					console.warn(`[sandbox.manage:${reqId}] createdMissingThread threadId=${threadId}`);
				}

				await client.mutation(api.sandboxApi.updateSession, {
					sessionId: session._id,
					status: 'ready',
					sandboxId: result.sandboxId,
					previewUrl: result.previewUrl,
					previewToken: result.previewToken,
					threadId
				});
				console.warn(
					`[sandbox.manage:${reqId}] sessionReady sessionId=${session._id} sandboxId=${result.sandboxId}`
				);
			} catch (e) {
				console.error(`[sandbox.manage:${reqId}] resumeFailed ${previewError(e)}`);
				await client.mutation(api.sandboxApi.updateSession, {
					sessionId: session._id,
					status: 'error',
					errorMessage: e instanceof Error ? e.message : 'Unknown error'
				});
				error(500, 'Failed to resume sandbox');
			}
		} else if (session.status === 'error') {
			// Auto-recover: delete broken session and create fresh
			console.warn(
				`[sandbox.manage:${reqId}] error state, auto-recovering sessionId=${session._id}`
			);
			try {
				if (session.sandboxId !== 'pending') {
					await deleteSandbox(session.sandboxId).catch(() => {});
				}
			} catch {
				// best effort
			}
			await client.mutation(api.sandboxApi.deleteSession, { sessionId: session._id });

			// Create fresh session
			await client.mutation(api.sandboxApi.createSession, {
				sandboxId: 'pending',
				status: 'creating'
			});
			const freshSession = await client.query(api.sandboxApi.getSession, {});
			if (!freshSession) error(500, 'Failed to create session after recovery');

			try {
				const result = await createSandbox(freshSession.userId);
				const { threadId } = await client.mutation(api.sandboxApi.createThread, {});
				await client.mutation(api.sandboxApi.updateSession, {
					sessionId: freshSession._id,
					status: 'ready',
					sandboxId: result.sandboxId,
					previewUrl: result.previewUrl,
					previewToken: result.previewToken,
					threadId
				});
				console.warn(`[sandbox.manage:${reqId}] recovered sessionId=${freshSession._id}`);
			} catch (e) {
				console.error(`[sandbox.manage:${reqId}] recovery failed ${previewError(e)}`);
				await client.mutation(api.sandboxApi.updateSession, {
					sessionId: freshSession._id,
					status: 'error',
					errorMessage: e instanceof Error ? e.message : 'Unknown error'
				});
				error(500, 'Failed to recover sandbox');
			}
		} else if (session.status === 'creating') {
			console.warn(
				`[sandbox.manage:${reqId}] refusing start: still creating sessionId=${session._id}`
			);
			error(409, 'Sandbox is still being created');
		} else if (session.status === 'ready') {
			// Verify sandbox is still alive
			try {
				console.warn(
					`[sandbox.manage:${reqId}] validating ready sandbox sandboxId=${session.sandboxId}`
				);
				const result = await ensureSandboxReady(session.sandboxId);
				await client.mutation(api.sandboxApi.updateSession, {
					sessionId: session._id,
					status: 'ready',
					sandboxId: result.sandboxId,
					threadId: session.threadId
				});
				console.warn(`[sandbox.manage:${reqId}] readyValidationOk sandboxId=${result.sandboxId}`);
			} catch (e) {
				console.error(`[sandbox.manage:${reqId}] readyValidationFailed ${previewError(e)}`);
				await client.mutation(api.sandboxApi.updateSession, {
					sessionId: session._id,
					status: 'error',
					errorMessage: e instanceof Error ? e.message : 'Sandbox is unreachable'
				});
				error(500, 'Sandbox is no longer reachable. Delete and recreate.');
			}
		}

		console.warn(`[sandbox.manage:${reqId}] action=start success`);
		return json({ success: true });
	}

	// stop/delete actions require existing session
	const session = await client.query(api.sandboxApi.getSession, {});
	if (!session) {
		error(404, 'No sandbox session found');
	}
	console.warn(
		`[sandbox.manage:${reqId}] action=${action} sessionId=${session._id} sandboxId=${session.sandboxId}`
	);

	try {
		if (action === 'stop') {
			if (session.sandboxId !== 'pending') {
				console.warn(`[sandbox.manage:${reqId}] stopping sandbox sandboxId=${session.sandboxId}`);
				await stopSandbox(session.sandboxId);
			}
			await client.mutation(api.sandboxApi.updateSession, {
				sessionId: session._id,
				status: 'stopped'
			});
			console.warn(`[sandbox.manage:${reqId}] sandbox stopped sessionId=${session._id}`);
		} else if (action === 'delete') {
			try {
				if (session.sandboxId !== 'pending') {
					console.warn(`[sandbox.manage:${reqId}] deleting sandbox sandboxId=${session.sandboxId}`);
					await deleteSandbox(session.sandboxId);
				}
			} catch {
				// Best effort - sandbox may already be gone
				console.warn(`[sandbox.manage:${reqId}] delete sandbox failed (best effort continue)`);
			}
			await client.mutation(api.sandboxApi.deleteSession, {
				sessionId: session._id
			});
			console.warn(`[sandbox.manage:${reqId}] session deleted sessionId=${session._id}`);
		}
	} catch (e) {
		console.error(`[sandbox.manage:${reqId}] action=${action} failed ${previewError(e)}`);
		error(500, e instanceof Error ? e.message : 'Operation failed');
	}

	console.warn(`[sandbox.manage:${reqId}] action=${action} success`);
	return json({ success: true });
};
