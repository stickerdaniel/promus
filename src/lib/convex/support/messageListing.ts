/**
 * Message listing helper for support threads
 *
 * Extracts the message listing logic from messages.ts into a reusable helper
 * that can be used by both the public listMessages query and the admin
 * listMessagesForAdmin query.
 */

import { listUIMessages, syncStreams } from '@convex-dev/agent';
import type { StreamArgs } from '@convex-dev/agent/validators';
import { components } from '../_generated/api';
import type { GenericQueryCtx } from 'convex/server';
import type { DataModel } from '../_generated/dataModel';
import type { PaginationOptions } from 'convex/server';

type Ctx = GenericQueryCtx<DataModel>;

interface ListMessagesForThreadArgs {
	threadId: string;
	paginationOpts: PaginationOptions;
	streamArgs?: StreamArgs;
}

/**
 * List messages for a thread with streaming support.
 *
 * Returns paginated messages enriched with metadata and streaming deltas.
 * Used by both the public `listMessages` query and admin `listMessagesForAdmin` query.
 */
export async function listMessagesForThread(
	ctx: Ctx,
	args: ListMessagesForThreadArgs
): Promise<unknown> {
	// Get paginated UIMessages (includes id field and text for display)
	const paginated = await listUIMessages(ctx, components.agent, {
		threadId: args.threadId,
		paginationOpts: args.paginationOpts
	});

	// Get raw messages to access metadata (listUIMessages doesn't include it)
	// Skip when numItems is 0 (delta-only queries don't need metadata)
	let rawMessages: { page: Array<{ _id: string; metadata?: Record<string, unknown> }> } = {
		page: []
	};
	if (args.paginationOpts.numItems > 0) {
		rawMessages = await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
			threadId: args.threadId,
			paginationOpts: args.paginationOpts,
			order: 'asc'
		});
	}

	// Create a map of message id -> metadata
	// Note: metadata fields (provider, providerMetadata) are stored as top-level fields
	const metadataMap = new Map<string, Record<string, unknown>>();
	for (const msg of rawMessages.page) {
		const rawMsg = msg as unknown as {
			_id: string;
			provider?: string;
			providerMetadata?: Record<string, unknown>;
		};
		// Only create metadata object if provider fields exist
		if (rawMsg.provider || rawMsg.providerMetadata) {
			metadataMap.set(rawMsg._id, {
				provider: rawMsg.provider,
				providerMetadata: rawMsg.providerMetadata
			});
		}
	}

	// Enrich UIMessages with metadata
	const enrichedPage = paginated.page.map((msg) => ({
		...msg,
		metadata: metadataMap.get(msg.id)
	}));

	// Get streaming deltas for in-progress messages
	const streams = await syncStreams(ctx, components.agent, {
		threadId: args.threadId,
		streamArgs: args.streamArgs,
		includeStatuses: ['streaming', 'finished', 'aborted']
	});

	return { ...paginated, page: enrichedPage, streams };
}
