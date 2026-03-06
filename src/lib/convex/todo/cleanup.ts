import { internalMutation } from '../_generated/server';

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Finds tasks stuck in 'working' status for longer than STALE_THRESHOLD_MS
 * and resets them to 'error'. Catches edge cases where even the catch block
 * in the action handler fails (e.g., Convex action hard-killed).
 */
export const recoverStaleTasks = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const cutoff = now - STALE_THRESHOLD_MS;

		const boards = await ctx.db.query('todoBoards').collect();

		for (const board of boards) {
			const tasks = [...board.tasks];
			let modified = false;

			for (let i = 0; i < tasks.length; i++) {
				const task = tasks[i];
				if (task.agentStatus !== 'working') continue;

				const startedAt = task.agentStartedAt ?? board.updatedAt;
				if (startedAt > cutoff) continue;

				tasks[i] = {
					...task,
					agentStatus: 'error' as const,
					agentSummary: 'Coda timed out while working on this task.',
					updatedAt: now
				};
				modified = true;
				console.log(
					`[cleanup] Recovered stale task ${task.id} (started ${Math.round((now - startedAt) / 60000)}m ago)`
				);
			}

			if (modified) {
				await ctx.db.patch(board._id, { tasks, updatedAt: now });
			}
		}
	}
});
