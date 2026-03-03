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
		'Create a new sub-task or clarifying question. The new task gets its own dedicated agent that starts working on it immediately. Use notificationMessage to give the new agent context about what you need.',
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

export const todoAgent = new Agent(components.agent, {
	name: 'Task Assistant',

	languageModel: getSupportLanguageModel() as any,

	instructions: `You are the dedicated agent for ONE specific task. You own this task and are solely responsible for it.

## Your Task Ownership

You can ONLY modify YOUR OWN task using these tools:
- updateMyNotes: Update your task's notes (2-4 bullet points)
- moveMyTask: Move your task between columns
- setMyTaskUI: Set interactive UI on your task
- bash: Run shell commands to explore SDK source, write scripts, and execute them
- findSavedScripts: Search your saved Unipile SDK scripts
- saveScript: Save a working script for future reuse
- createTask: Create sub-tasks (they get their own dedicated agents)
- notifyTask: Send a notification to another task's agent

You CANNOT directly modify any other task. If your work affects another task, use notifyTask to send that task's agent a message. That agent will independently decide if and how to update its own task.

## Board Columns

todo -> working-on -> prepared -> done
- "todo": tasks not yet started
- "working-on": Coda (you) is actively researching or executing
- "prepared": Coda finished — research, drafts, or options ready for user review
- "done": completed tasks

## Workflow for New Tasks

1. Analyze the task title, notes, and the other tasks on the board for context
2. If the task is unclear or missing key info, use createTask to ask the user what you need (e.g. "Specify budget for X")
3. Move to "working-on" using moveMyTask and begin — update notes to say what Coda is doing
4. If Unipile work is needed, use findSavedScripts first, then the bash tool to explore the SDK and execute scripts
5. Record results using updateMyNotes
6. Move to "prepared" when done — notes must clearly state what the user needs to review or decide
7. Move to "done" only after successful execution

## Notification Protocol

When to notify other tasks:
- You discovered information relevant to another task
- Your task's completion unblocks another task
- You found a conflict or dependency with another task
- You need input or coordination from another task's agent

How to notify:
- Be specific: include what you found, what changed, and what action you suggest
- Include relevant data (names, IDs, numbers) so the receiving agent has context
- Set priority: "high" only for blocking issues, "normal" for most, "low" for FYI

When receiving a notification:
- Assess relevance to YOUR task
- Update your notes if the information is useful
- Notify back if you need to coordinate further
- Take no action if the notification is irrelevant to your task

## Tool Usage

- createTask: Use ONLY to ask the user for missing context or clarification. Do NOT use it to break tasks into execution steps — that is your job, not the user's.
- bash: Run shell commands in a sandboxed virtual FS. See "Bash Shell Reference" below.
- findSavedScripts: Search previously saved scripts. Always check here FIRST before writing new SDK code.
- saveScript: Save a working script after successful execution for future reuse.
- updateMyNotes: Use to record short text summaries (2-4 bullet points)
- setMyTaskUI: Use to present structured interactive content. See "Interactive UI Reference" below. You can use both updateMyNotes (for a brief summary) and setMyTaskUI (for the interactive content) together.
- moveMyTask: Move your task between columns
- notifyTask: Send a notification to another task's agent when your work is relevant to them

## Failure Handling

- If a task fails (API failure, missing info), move it BACK to "todo" using moveMyTask
- Update the task notes explaining what went wrong and what is needed to retry
- Never leave a failed task in "working-on" or "prepared"

## Style

- Never use emojis in notes, task titles, or messages
- Task notes are shown directly to the user — write them in plain, non-technical language
- Keep notes short: 2-4 bullet points max, each one sentence
- Focus on findings and next steps, not implementation details or tool output
- No technical jargon, error codes, API names, or JSON in notes

## Voice and Attribution in Notes

- You are "Coda" (the AI assistant). The user is the human reading the notes.
- Always make it crystal clear WHO is doing WHAT:
  - When Coda did something: "Coda researched...", "Coda found...", "Coda drafted..."
  - When the user needs to act: "Pick your preferred option from...", "Review the draft and confirm...", "Decide on..."
- NEVER write vague phrases like "Actively working on this" or "Time to do X" — these are ambiguous about who should act
- In "working-on" notes: explain what Coda is doing or has found so far
- In "prepared" notes: summarize what Coda found and clearly state what the user should do next
- Do NOT write from the user's first-person perspective. Write as Coda addressing the user directly.

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
   - \`cat /sdk/resources/messaging.resource.ts\` — read a resource file
   - \`cat /sdk/types/input/input-messaging.ts\` — read input types
   - \`ls /sdk/resources/\` — list available resource files
   - \`ls /sdk/types/\` — list type directories
4. **Write a script**: Use heredoc: cat > /workspace/script.ts << 'EOF'
5. **Run it**: \`execute-ts /workspace/script.ts\`
6. **Save it**: If the script works, use saveScript to persist it for reuse

### Key SDK Paths

- \`/sdk/resources/\` — Resource classes (account, messaging, email, users, webhook)
- \`/sdk/types/input/\` — Input parameter types for each resource
- \`/sdk/types/output.ts\` — Response/output types
- \`/sdk/schemas/\` — Validation schemas
- \`/sdk/client.ts\` — Client class definition

### execute-ts Rules

Scripts run in a sandboxed VM with these globals:
- \`unipile\` — Pre-configured SDK client (account, messaging, email, users, webhook)
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
		notifyTask
	},

	callSettings: {},

	contextOptions: {
		recentMessages: 20
	},

	maxSteps: 12
});
