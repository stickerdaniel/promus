import { Agent, createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { components, internal } from '../_generated/api';
import { getSupportLanguageModel } from '../support/llmProvider';
import type { ToolCtx } from '@convex-dev/agent';

const MAX_RESULT = 4096;
const MAX_NOTIFICATIONS_PER_MINUTE = 5;
const MAX_NOTIFICATION_DEPTH = 3;

function truncate(str: string, max: number): string {
	if (str.length <= max) return str;
	return str.slice(0, max) + '\n\n[truncated]';
}

/** Resolve the task ID that this agent owns, using the threadId from context. */
async function resolveOwnTaskId(ctx: ToolCtx): Promise<string | null> {
	if (!ctx.userId || !ctx.threadId) return null;
	return await ctx.runQuery(internal.todos.getTaskIdByThreadId, {
		userId: ctx.userId,
		threadId: ctx.threadId
	});
}

export const bash = createTool({
	description:
		'Run a shell command in a sandboxed virtual filesystem. The session has /sdk/ (read-only Unipile SDK source), /scripts/ (saved scripts), and /workspace/ (scratch). Use grep/cat/ls to explore SDK source, write scripts to /workspace/, and run them with `execute-ts /workspace/script.ts`.',
	inputSchema: z.object({
		command: z
			.string()
			.describe(
				'Shell command to run. Supports grep, cat, ls, find, sed, awk, jq, and execute-ts for running TypeScript scripts.'
			)
	}),
	execute: async (ctx: ToolCtx, input): Promise<Record<string, unknown>> => {
		if (!ctx.userId) {
			return { success: false, error: 'No userId — cannot resolve account access' };
		}

		const siteUrl = process.env.SANDBOX_URL;
		const internalKey = process.env.SANDBOX_INTERNAL_API_KEY;
		if (!siteUrl || !internalKey) {
			return {
				success: false,
				error: 'SANDBOX_URL and SANDBOX_INTERNAL_API_KEY must be configured'
			};
		}

		let allowedAccountIds: string[];
		try {
			allowedAccountIds = await ctx.runQuery(components.unipile.queries.getUserAccountIds, {
				userId: ctx.userId
			});
		} catch (e) {
			return {
				success: false,
				error: `Failed to resolve account access: ${e instanceof Error ? e.message : String(e)}`
			};
		}

		// Load saved scripts to populate /scripts/ in the session
		let savedScripts: Record<string, string> | undefined;
		try {
			savedScripts = await ctx.runQuery(internal.todo.scripts.getAllScripts, {
				userId: ctx.userId
			});
		} catch {
			// Non-fatal: continue without saved scripts
		}

		const sessionId = ctx.threadId ?? ctx.userId;

		try {
			const response: Response = await fetch(`${siteUrl}/api/sandbox/shell`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-internal-key': internalKey
				},
				body: JSON.stringify({
					sessionId,
					command: input.command,
					allowedAccountIds,
					savedScripts
				})
			});

			if (!response.ok) {
				const text = await response.text();
				return { success: false, error: `HTTP ${response.status}: ${text}` };
			}

			const result: { stdout: string; stderr: string; exitCode: number } = await response.json();
			const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
			return {
				success: result.exitCode === 0,
				output: truncate(output, MAX_RESULT),
				exitCode: result.exitCode
			};
		} catch (e) {
			return {
				success: false,
				error: `Fetch failed: ${e instanceof Error ? e.message : String(e)}`
			};
		}
	}
});

export const findSavedScripts = createTool({
	description:
		'Search saved Unipile SDK scripts by keyword. Returns matching scripts with slug, title, description, and tags. Check here first before writing new scripts.',
	inputSchema: z.object({
		query: z.string().describe('Keyword to search across slug, title, description, and tags')
	}),
	execute: async (ctx: ToolCtx, input): Promise<Record<string, unknown>> => {
		if (!ctx.userId) return { success: false, error: 'No userId' };
		const results: { slug: string; title: string; description: string; tags: string[] }[] =
			await ctx.runQuery(internal.todo.scripts.findScripts, {
				userId: ctx.userId,
				query: input.query
			});
		return {
			success: true,
			scripts: results.map((s) => ({
				slug: s.slug,
				title: s.title,
				description: s.description,
				tags: s.tags
			}))
		};
	}
});

export const saveScript = createTool({
	description:
		'Save a working Unipile SDK script for reuse. Scripts are saved per user and appear in /scripts/ in future sessions. Use a descriptive slug (kebab-case) and include tags for searchability.',
	inputSchema: z.object({
		slug: z.string().describe('Unique kebab-case identifier (e.g. "list-linkedin-chats")'),
		title: z.string().describe('Human-readable title'),
		description: z.string().describe('What the script does'),
		code: z.string().describe('The TypeScript code to save'),
		tags: z.array(z.string()).describe('Tags for search (e.g. ["messaging", "linkedin", "chats"])')
	}),
	execute: async (ctx: ToolCtx, input): Promise<Record<string, unknown>> => {
		if (!ctx.userId) return { success: false, error: 'No userId' };
		await ctx.runMutation(internal.todo.scripts.saveScript, {
			userId: ctx.userId,
			slug: input.slug,
			title: input.title,
			description: input.description,
			code: input.code,
			tags: input.tags,
			skipIfExists: true
		});
		return { success: true, slug: input.slug };
	}
});

export const updateMyNotes = createTool({
	description:
		'Update notes on YOUR task (the task you are the dedicated agent for). Use for short text summaries (2-4 bullet points).',
	inputSchema: z.object({
		notes: z.string().describe('Notes content to set on your task')
	}),
	execute: async (ctx: ToolCtx, input) => {
		const taskId = await resolveOwnTaskId(ctx);
		if (!taskId) return { success: false, error: 'Could not resolve own task' };
		await ctx.runMutation(internal.todos.updateTaskNotesInternal, {
			userId: ctx.userId!,
			taskId,
			notes: input.notes
		});
		return { success: true };
	}
});

export const createTask = createTool({
	description:
		'Create a follow-up sub-task. The new task gets its own dedicated agent that starts working on it immediately. Use notificationMessage to give the new agent context about what you need.',
	inputSchema: z.object({
		title: z.string().describe('Title for the new task'),
		notes: z.string().optional().describe('Optional notes or context for the task'),
		notificationMessage: z
			.string()
			.optional()
			.describe(
				'Optional message to the new task agent explaining what you need from it and why you created it'
			)
	}),
	execute: async (ctx: ToolCtx, input) => {
		if (!ctx.userId) return { success: false as const, error: 'No userId' };
		const taskId: string = await ctx.runMutation(internal.todos.addTaskInternal, {
			userId: ctx.userId,
			title: input.title,
			notes: input.notes
		});
		// Auto-trigger the new task's agent
		await ctx.scheduler.runAfter(0, internal.todo.messages.triggerAgentForNewTask, {
			userId: ctx.userId,
			taskId,
			taskTitle: input.title,
			taskNotes: input.notes,
			taskColumn: 'todo',
			parentNotification: input.notificationMessage
		});
		return { success: true as const, taskId };
	}
});

export const moveMyTask = createTool({
	description:
		'Move YOUR task to a different column (todo, working-on, prepared, done). You can only move your own task.',
	inputSchema: z.object({
		columnId: z
			.enum(['todo', 'working-on', 'prepared', 'done'])
			.describe('Target column to move your task to')
	}),
	execute: async (ctx: ToolCtx, input) => {
		const taskId = await resolveOwnTaskId(ctx);
		if (!taskId) return { success: false, error: 'Could not resolve own task' };
		await ctx.runMutation(internal.todos.moveTaskInternal, {
			userId: ctx.userId!,
			taskId,
			columnId: input.columnId
		});
		return { success: true };
	}
});

export const setMyTaskUI = createTool({
	description:
		'Set interactive UI on YOUR task. Outputs a json-render spec that renders as real UI components (cards, tables, buttons, inputs, etc.). Use for structured interactive content like product comparisons, email drafts, data tables, or any rich visual output. Replaces any existing UI on the task.',
	inputSchema: z.object({
		spec: z
			.string()
			.describe(
				'JSON-stringified json-render spec object with root, elements, and optional state fields'
			)
	}),
	execute: async (ctx: ToolCtx, input) => {
		const taskId = await resolveOwnTaskId(ctx);
		if (!taskId) return { success: false, error: 'Could not resolve own task' };
		try {
			JSON.parse(input.spec);
		} catch {
			return { success: false, error: 'Invalid JSON in spec' };
		}
		await ctx.runMutation(internal.todos.updateTaskSpecInternal, {
			userId: ctx.userId!,
			taskId,
			agentSpec: input.spec
		});
		return { success: true };
	}
});

export const notifyTask = createTool({
	description: `Send a notification to another task's agent. Use this when your work affects or is relevant to another task. The other task's agent will wake up, read your message, and independently decide what to do. You CANNOT modify other tasks directly — you can only notify them. Include enough context so the receiving agent can act on its own.`,
	inputSchema: z.object({
		taskId: z.string().describe('The ID of the task to notify'),
		message: z
			.string()
			.describe(
				'The notification message. Be specific about what happened and what the receiving agent might want to do.'
			),
		priority: z
			.enum(['low', 'normal', 'high'])
			.default('normal')
			.describe('Notification priority. Use "high" only for blocking issues.')
	}),
	execute: async (ctx: ToolCtx, input) => {
		if (!ctx.userId || !ctx.threadId) return { success: false, error: 'Missing context' };

		// Resolve sender's taskId
		const senderTaskId = await resolveOwnTaskId(ctx);

		// Rate limit: max 5 notifications per minute per sender
		if (senderTaskId) {
			const recentCount: number = await ctx.runQuery(
				internal.todo.notifications.countRecentNotificationsFrom,
				{ userId: ctx.userId, fromTaskId: senderTaskId, sinceMs: 60_000 }
			);
			if (recentCount >= MAX_NOTIFICATIONS_PER_MINUTE) {
				return {
					success: false,
					error: 'Rate limit: too many notifications sent recently. Wait before notifying again.'
				};
			}
		}

		// Look up the target task
		const targetInfo = await ctx.runQuery(internal.todos.getTaskThreadInfo, {
			userId: ctx.userId,
			taskId: input.taskId
		});
		if (!targetInfo) {
			return { success: false, error: `Task ${input.taskId} not found` };
		}

		// Determine notification depth from any pending notifications on sender's task
		const senderDepth: number = senderTaskId
			? await ctx.runQuery(internal.todo.notifications.getMaxDepthForTask, {
					userId: ctx.userId,
					taskId: senderTaskId
				})
			: 0;
		const newDepth = senderDepth + 1;

		if (newDepth > MAX_NOTIFICATION_DEPTH) {
			return {
				success: false,
				error: `Notification chain too deep (max ${MAX_NOTIFICATION_DEPTH} hops). Cannot forward further.`
			};
		}

		// Record the notification
		await ctx.runMutation(internal.todo.notifications.createNotification, {
			userId: ctx.userId,
			fromTaskId: senderTaskId ?? 'unknown',
			toTaskId: input.taskId,
			message: input.message,
			priority: input.priority,
			depth: newDepth
		});

		if (targetInfo.threadId) {
			// Target has a thread — wake its agent with a notification
			await ctx.scheduler.runAfter(0, internal.todo.messages.triggerAgentForNotification, {
				userId: ctx.userId,
				threadId: targetInfo.threadId,
				taskId: input.taskId,
				taskTitle: targetInfo.title,
				fromTaskId: senderTaskId ?? 'unknown',
				message: input.message,
				priority: input.priority
			});
		} else {
			// Target has no thread yet — create one and trigger
			await ctx.scheduler.runAfter(0, internal.todo.messages.triggerAgentForNewTask, {
				userId: ctx.userId,
				taskId: input.taskId,
				taskTitle: targetInfo.title,
				taskNotes: targetInfo.notes,
				taskColumn: targetInfo.columnId,
				incomingNotification: {
					fromTaskId: senderTaskId ?? 'unknown',
					message: input.message,
					priority: input.priority
				}
			});
		}

		return { success: true, notified: input.taskId };
	}
});

export const webSearch = createTool({
	description:
		'Search the web using Brave Search. Returns titles, snippets, and URLs. Use this to research topics, find documentation, or answer factual questions.',
	inputSchema: z.object({
		query: z.string().describe('Search query keywords'),
		count: z.number().optional().describe('Number of results (default 5, max 20)')
	}),
	execute: async (_ctx: ToolCtx, input): Promise<Record<string, unknown>> => {
		const apiKey = process.env.BRAVE_SEARCH_API_KEY;
		if (!apiKey) return { success: false, error: 'BRAVE_SEARCH_API_KEY not configured' };

		const params = new URLSearchParams({
			q: input.query,
			count: String(input.count ?? 5)
		});

		const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
			headers: {
				Accept: 'application/json',
				'X-Subscription-Token': apiKey
			}
		});

		if (!res.ok) {
			return { success: false, error: `Brave API ${res.status}: ${await res.text()}` };
		}

		const data = await res.json();
		const results = (data.web?.results ?? []).map(
			(r: { title: string; url: string; description: string }) => ({
				title: r.title,
				url: r.url,
				snippet: r.description
			})
		);

		return { success: true, results };
	}
});

export const todoAgent = new Agent(components.agent, {
	name: 'Task Assistant',

	languageModel: getSupportLanguageModel() as any,

	instructions: `You are Coda — a relentlessly resourceful personal assistant who owns exactly one task on the user's board.

You take pride in delivering results that are genuinely useful. That means:

- You act, never ask. Make reasonable assumptions and go. If truly blocked (e.g. no connected accounts), explain what's missing in your notes and move to "todo."
- You verify before you act. Always check the current state before performing an action. Don't duplicate what's already done.
- You explore before you code. grep /sdk/resources/ and /sdk/types/ to discover methods, parameters, and response fields. Different methods return different schemas — read the types to find what you need. Never write a script until you know which method returns the data you want.
- You always console.log() the full response and inspect the raw output. Don't assume a field exists or is missing without seeing the actual data.
- You make your output actionable. Every result MUST include concrete data — numbers, names, links, profiles. "Found the path to get follower count" is a failure; "You have 2,847 followers" is a success.
- You never give up after one try. Work efficiently within a limited step budget. When something fails: read the error, grep the SDK for alternative methods, try different parameters, paginate through list endpoints, and cross-reference multiple API calls. Stop exploring once you have enough evidence to take action or to explain the blocker clearly.
- You always finish. Move your task to "done" or "prepared" before stopping. If you're not making progress, wrap up gracefully with concrete progress notes instead of continuing to loop.

CRITICAL: Reading SDK source is research, NOT execution. You have NOT completed a task until you write a script, execute it with execute-ts, and see confirming output. NEVER claim you did something (sent invite, followed, fetched data) unless you have console.log output proving it happened. If you explored the SDK but haven't executed a script yet, you are not done — keep going.

## Tools

- updateMyNotes: Record findings as 2-4 short bullet points
- moveMyTask: Move your task between board columns
- setMyTaskUI: Present structured interactive content (see Interactive UI Reference below)
- bash: Run shell commands in a sandboxed VM (see Bash Shell Reference below)
- findSavedScripts: Search previously saved scripts — always check before writing new code
- saveScript: Save a working script for future reuse
- createTask: Delegate concrete follow-up work only — never to ask questions
- notifyTask: Message another task's agent when your work is relevant to them
- webSearch: Search the web for information. Use for research queries (finding docs, how-tos, factual info). Use bash + execute-ts for Unipile SDK operations

You can ONLY modify YOUR OWN task. To affect another task, use notifyTask.

## Board

todo -> working-on -> prepared -> done

- "working-on": Coda is actively executing
- "prepared": results ready for the user to review

## Workflow

1. Read the task title, notes, and board context
2. Move to "working-on"
3. For SDK work: check saved scripts first, then explore SDK source to understand methods and schemas
4. Write a script to /workspace/, execute it with execute-ts, read the output
5. If output is missing data or empty: try alternative methods, inspect raw responses, iterate
6. Update notes with ACTUAL results from script output — never with plans or intentions
7. Move to "prepared" or "done"

Do NOT call updateMyNotes until you have real results from an executed script. Planning notes like "Next: will run X" are useless to the user.

## Communication

You are "Coda." The user is the human reading your notes.

Notes:
- Write in plain, non-technical language. No jargon, error codes, API names, or JSON.
- Make it clear who does what: "Coda found..." vs "Review and decide..."
- Never expose internal infrastructure — no account IDs, endpoints, or SDK names. Write as if Coda naturally has access to the user's connected accounts.
- No emojis.

Summary (your final text message):
- Single factual sentence, under 80 characters (e.g. "Found 47 LinkedIn connections")

## Notifications

Notify other tasks when: you found relevant info, your work unblocks them, or you need coordination.
Be specific — include data and suggested actions. Use "high" priority only for blockers.
When receiving: assess relevance, update your notes if useful, ignore if not.

---

## Interactive UI Reference (for setMyTaskUI)

The spec is a JSON object with this structure:
\`\`\`json
{
  "root": "root-key",
  "elements": {
    "root-key": { "type": "Stack", "props": { "direction": "vertical", "gap": "md" }, "children": ["child1", "child2"] },
    "child1": { "type": "Heading", "props": { "text": "Results", "level": "h3" }, "children": [] },
    "child2": { "type": "Text", "props": { "content": "Here are your options." }, "children": [] }
  },
  "state": {}
}
\`\`\`

Rules:
- Every element referenced in "children" MUST exist as a key in "elements"
- The "root" key must point to an existing element
- Use "state" for initial data that components can read via { "$state": "/path" }
- Stringify the entire spec object when calling setMyTaskUI

Available components:
- Stack: Layout container. Props: direction ("horizontal"|"vertical"), gap ("sm"|"md"|"lg"), wrap (bool). Has children.
- Card: Card with optional title/description. Props: title, description. Has children.
- Grid: Grid layout. Props: columns ("1"|"2"|"3"|"4"), gap ("sm"|"md"|"lg"). Has children.
- Heading: Text heading. Props: text (string), level ("h1"|"h2"|"h3"|"h4").
- Text: Paragraph. Props: content (string), muted (bool).
- Badge: Status badge. Props: text, variant ("default"|"secondary"|"destructive"|"outline").
- Alert: Alert message. Props: title, description, variant ("default"|"destructive").
- Separator: Horizontal divider. No props.
- Metric: Numeric display. Props: label, value, detail, trend ("up"|"down"|"neutral").
- Table: Data table. Props: data (array of objects), columns (array of {key, label}), emptyMessage.
- Link: External link. Props: text, href. Opens in new tab.
- Button: Clickable button. Props: label, variant, size, disabled. Use on.press for actions.
- TextInput: Text field. Props: label, value, placeholder. Use { "$bindState": "/path" } for two-way binding.
- Progress: Progress bar. Props: value (number), max (number).

Example — product comparison:
\`\`\`json
{
  "root": "container",
  "elements": {
    "container": { "type": "Stack", "props": { "direction": "vertical", "gap": "md" }, "children": ["heading", "grid"] },
    "heading": { "type": "Heading", "props": { "text": "Top Options", "level": "h3" }, "children": [] },
    "grid": { "type": "Grid", "props": { "columns": "2", "gap": "md" }, "children": ["card1", "card2"] },
    "card1": { "type": "Card", "props": { "title": "Roborock S8 Pro Ultra", "description": "$1,399" }, "children": ["desc1", "link1"] },
    "desc1": { "type": "Text", "props": { "content": "Self-emptying, self-washing. Best overall for large homes." }, "children": [] },
    "link1": { "type": "Link", "props": { "text": "View on Amazon", "href": "https://amazon.com/..." }, "children": [] },
    "card2": { "type": "Card", "props": { "title": "iRobot Roomba j7+", "description": "$599" }, "children": ["desc2", "link2"] },
    "desc2": { "type": "Text", "props": { "content": "Smart obstacle avoidance. Great value pick." }, "children": [] },
    "link2": { "type": "Link", "props": { "text": "View on Amazon", "href": "https://amazon.com/..." }, "children": [] }
  },
  "state": {}
}
\`\`\`

---

## Bash Shell Reference

### Virtual Filesystem Layout

Your bash session has three mount points:
- \`/sdk/\` — Read-only Unipile Node SDK TypeScript source (resources, types, schemas)
- \`/scripts/\` — Your saved scripts (pre-loaded from previous sessions)
- \`/workspace/\` — Scratch space for writing new scripts

### Workflow for Unipile Tasks

1. **Check saved scripts first**: Use findSavedScripts to see if a relevant script already exists
2. **If found**: Run it directly: \`execute-ts /scripts/slug-name.ts\`
3. **If not found**: Explore the SDK to discover the right methods:
   - \`grep -rn 'methodName' /sdk/resources/\` — find method definitions
   - \`grep -rn 'fieldName' /sdk/types/\` — find which response types contain a field
   - \`cat /sdk/resources/users.resource.ts\` — read a resource file
   - \`cat /sdk/types/input/input-users.ts\` — read input types
   - Different methods return different response schemas — always check the types!
4. **Write a script**: Use heredoc: cat > /workspace/script.ts << 'EOF'
5. **ALWAYS console.log() results**: Every script MUST console.log() the full response so you can inspect what fields are returned
6. **Run it**: \`execute-ts /workspace/script.ts\`
7. **If output is missing data**: grep the SDK types for the field you need, find which method/schema includes it, write a new script using that method, and try again
8. **Save it**: If the script works, use saveScript to persist it for reuse

### Key SDK Paths

- \`/sdk/resources/\` — Resource classes (account, messaging, email, users, webhook)
- \`/sdk/types/input/\` — Input parameter types for each resource
- \`/sdk/types/output.ts\` — Response/output types
- \`/sdk/schemas/\` — Validation schemas
- \`/sdk/client.ts\` — Client class definition
- \`/sdk/README.md\` — Examples including raw Voyager API calls for actions not covered by SDK methods

### execute-ts Rules

Scripts run in a sandboxed VM with these globals:
- \`unipile\` — Pre-configured SDK client (account, messaging, email, users, webhook, request)
  - If an SDK method doesn't exist for an action, use \`unipile.request.send()\` to proxy raw LinkedIn Voyager API calls. See \`/sdk/README.md\` "Endpoint Not Packaged in SDK" for the pattern.
- \`USER_ACCOUNT_IDS\` — Frozen array of the user's allowed Unipile account IDs
- \`console.log()\` — Output results (captured and returned)
- \`fetch\`, \`JSON\`, \`Date\`, \`Promise\`, \`Buffer\`, \`URL\`, \`Headers\`, \`URLSearchParams\`, \`setTimeout\`, \`AbortController\`, \`TextEncoder\`, \`TextDecoder\`, \`FormData\`, \`Blob\`

Rules:
1. No \`import\` or \`require\` — only the globals above
2. Use \`console.log()\` to output results
3. Top-level await is supported (wrapped in async IIFE)
4. SDK methods return parsed data — no \`.json()\` needed
5. 15-second execution timeout
6. Always use \`USER_ACCOUNT_IDS\` for account IDs — never hardcode them`,

	tools: {
		createTask,
		bash,
		findSavedScripts,
		saveScript,
		updateMyNotes,
		moveMyTask,
		setMyTaskUI,
		notifyTask,
		webSearch
	},

	callSettings: {},

	contextOptions: {
		recentMessages: 20
	},

	maxSteps: 40
});
