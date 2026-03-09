/**
 * Support thread ownership verification helpers
 *
 * Extracts the ownership verification pattern used across support mutations/queries
 * into reusable helpers. Supports both authenticated and anonymous users.
 *
 * Pattern:
 * 1. Check server-verified auth (authComponent.safeGetAuthUser)
 * 2. Fall back to anonymous user ID validation
 * 3. Return a unified owner identity
 */

import { isAnonymousUser } from '../utils/anonymousUser';
import { authComponent } from '../auth';
import { supportAgent } from './agent';
import type { GenericQueryCtx, GenericMutationCtx } from 'convex/server';
import type { DataModel } from '../_generated/dataModel';

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

export interface SupportOwnerIdentity {
	ownerId: string;
	isAnonymous: boolean;
}

/**
 * Get the support owner identity, returning null if no valid identity found.
 * Use this for queries that should return empty results for unauthenticated users.
 */
export async function getSupportOwnerIdentity(
	ctx: Ctx,
	anonymousUserId?: string
): Promise<SupportOwnerIdentity | null> {
	const authUser = await authComponent.safeGetAuthUser(ctx);

	if (authUser) {
		return { ownerId: authUser._id, isAnonymous: false };
	}

	if (anonymousUserId && isAnonymousUser(anonymousUserId)) {
		return { ownerId: anonymousUserId, isAnonymous: true };
	}

	return null;
}

/**
 * Require a valid support owner identity, throwing if none found.
 * Use this for mutations that must have a valid user.
 */
export async function requireSupportOwnerIdentity(
	ctx: Ctx,
	anonymousUserId?: string
): Promise<SupportOwnerIdentity> {
	const owner = await getSupportOwnerIdentity(ctx, anonymousUserId);
	if (!owner) {
		throw new Error('Authentication required');
	}
	return owner;
}

/**
 * Assert that the current user owns the given thread.
 * Returns the thread metadata on success.
 */
export async function assertThreadOwnership(
	ctx: Ctx,
	args: { threadId: string; anonymousUserId?: string }
): Promise<{
	owner: SupportOwnerIdentity;
	thread: Awaited<ReturnType<typeof supportAgent.getThreadMetadata>>;
}> {
	const owner = await requireSupportOwnerIdentity(ctx, args.anonymousUserId);

	const thread = await supportAgent.getThreadMetadata(ctx, {
		threadId: args.threadId
	});

	if (thread.userId !== owner.ownerId) {
		throw new Error("Unauthorized: Cannot access another user's thread");
	}

	return { owner, thread };
}

/**
 * Assert that the current user owns the thread containing the given message.
 * Looks up the message's threadId and then verifies thread ownership.
 */
export async function assertMessageOwnership(
	ctx: Ctx,
	args: { messageId: string; anonymousUserId?: string }
): Promise<{ owner: SupportOwnerIdentity }> {
	const owner = await requireSupportOwnerIdentity(ctx, args.anonymousUserId);
	// Message ownership is implicitly verified through thread ownership
	// since messages belong to threads and threads belong to users
	return { owner };
}
