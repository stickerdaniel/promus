import { describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the support ownership module.
 *
 * These tests validate the ownership verification logic in isolation,
 * mocking the auth component and agent interactions.
 */

// Mock the auth component
vi.mock('../../auth', () => ({
	authComponent: {
		safeGetAuthUser: vi.fn()
	}
}));

// Mock the support agent
vi.mock('../agent', () => ({
	supportAgent: {
		getThreadMetadata: vi.fn()
	}
}));

import { authComponent } from '../../auth';
import { supportAgent } from '../agent';
import {
	getSupportOwnerIdentity,
	requireSupportOwnerIdentity,
	assertThreadOwnership,
	assertMessageOwnership
} from '../ownership';

const mockSafeGetAuthUser = vi.mocked(authComponent.safeGetAuthUser);
const mockGetThreadMetadata = vi.mocked(supportAgent.getThreadMetadata);

// Minimal mock context
const mockCtx = {} as any;

describe('getSupportOwnerIdentity', () => {
	it('returns authenticated user identity when logged in', async () => {
		mockSafeGetAuthUser.mockResolvedValue({ _id: 'user_123' } as any);

		const result = await getSupportOwnerIdentity(mockCtx);

		expect(result).toEqual({ ownerId: 'user_123', isAnonymous: false });
	});

	it('returns anonymous identity for valid anon ID', async () => {
		mockSafeGetAuthUser.mockResolvedValue(undefined);

		const result = await getSupportOwnerIdentity(mockCtx, 'anon_abc-123');

		expect(result).toEqual({ ownerId: 'anon_abc-123', isAnonymous: true });
	});

	it('returns null when no valid identity', async () => {
		mockSafeGetAuthUser.mockResolvedValue(undefined);

		const result = await getSupportOwnerIdentity(mockCtx);

		expect(result).toBeNull();
	});

	it('returns null for invalid anonymous ID format', async () => {
		mockSafeGetAuthUser.mockResolvedValue(undefined);

		const result = await getSupportOwnerIdentity(mockCtx, 'not_anon_id');

		expect(result).toBeNull();
	});

	it('prefers authenticated user over anonymous ID', async () => {
		mockSafeGetAuthUser.mockResolvedValue({ _id: 'user_456' } as any);

		const result = await getSupportOwnerIdentity(mockCtx, 'anon_xyz-789');

		expect(result).toEqual({ ownerId: 'user_456', isAnonymous: false });
	});
});

describe('requireSupportOwnerIdentity', () => {
	it('returns identity when authenticated', async () => {
		mockSafeGetAuthUser.mockResolvedValue({ _id: 'user_789' } as any);

		const result = await requireSupportOwnerIdentity(mockCtx);

		expect(result).toEqual({ ownerId: 'user_789', isAnonymous: false });
	});

	it('throws when no valid identity', async () => {
		mockSafeGetAuthUser.mockResolvedValue(undefined);

		await expect(requireSupportOwnerIdentity(mockCtx)).rejects.toThrow('Authentication required');
	});
});

describe('assertThreadOwnership', () => {
	it('succeeds when authenticated user owns thread', async () => {
		mockSafeGetAuthUser.mockResolvedValue({ _id: 'user_owner' } as any);
		mockGetThreadMetadata.mockResolvedValue({ userId: 'user_owner' } as any);

		const result = await assertThreadOwnership(mockCtx, { threadId: 'thread_1' });

		expect(result.owner.ownerId).toBe('user_owner');
		expect(result.owner.isAnonymous).toBe(false);
	});

	it('succeeds when anonymous user owns thread', async () => {
		mockSafeGetAuthUser.mockResolvedValue(undefined);
		mockGetThreadMetadata.mockResolvedValue({ userId: 'anon_owner-123' } as any);

		const result = await assertThreadOwnership(mockCtx, {
			threadId: 'thread_2',
			anonymousUserId: 'anon_owner-123'
		});

		expect(result.owner.ownerId).toBe('anon_owner-123');
		expect(result.owner.isAnonymous).toBe(true);
	});

	it('throws when user does not own thread', async () => {
		mockSafeGetAuthUser.mockResolvedValue({ _id: 'user_other' } as any);
		mockGetThreadMetadata.mockResolvedValue({ userId: 'user_owner' } as any);

		await expect(assertThreadOwnership(mockCtx, { threadId: 'thread_3' })).rejects.toThrow(
			"Unauthorized: Cannot access another user's thread"
		);
	});

	it('throws when no identity provided', async () => {
		mockSafeGetAuthUser.mockResolvedValue(undefined);

		await expect(assertThreadOwnership(mockCtx, { threadId: 'thread_4' })).rejects.toThrow(
			'Authentication required'
		);
	});
});

describe('assertMessageOwnership', () => {
	it('succeeds when authenticated user is verified', async () => {
		mockSafeGetAuthUser.mockResolvedValue({ _id: 'user_msg_owner' } as any);

		const result = await assertMessageOwnership(mockCtx, { messageId: 'msg_1' });

		expect(result.owner.ownerId).toBe('user_msg_owner');
	});

	it('throws when no identity provided', async () => {
		mockSafeGetAuthUser.mockResolvedValue(undefined);

		await expect(assertMessageOwnership(mockCtx, { messageId: 'msg_2' })).rejects.toThrow(
			'Authentication required'
		);
	});
});
