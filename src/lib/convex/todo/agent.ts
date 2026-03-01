import { Agent, createTool } from '@convex-dev/agent';
import { z } from 'zod';
import { components, internal } from '../_generated/api';
import { getTaskLanguageModel } from '../support/llmProvider';
import type { ToolCtx } from '@convex-dev/agent';

const MAX_RESULT = 4096;

function truncate(str: string, max: number): string {
	if (str.length <= max) return str;
	return str.slice(0, max) + '\n\n[truncated]';
}

export const executeUnipileCode = createTool({
	description:
		'Execute TypeScript code that uses the Unipile SDK. Write code that uses the `unipile` global object to interact with messaging, email, and contact APIs. The code runs in a sandboxed VM with a 15-second timeout.',
	args: z.object({
		code: z
			.string()
			.describe(
				'TypeScript code to execute. Has access to `unipile` global and `console.log()` for output. No imports allowed.'
			)
	}),
	handler: async (ctx: ToolCtx, args) => {
		if (!ctx.userId) {
			return { success: false, error: 'No userId — cannot resolve account access' };
		}

		const siteUrl = process.env.SITE_URL;
		const internalKey = process.env.SANDBOX_INTERNAL_API_KEY;
		if (!siteUrl || !internalKey) {
			return { success: false, error: 'SITE_URL or SANDBOX_INTERNAL_API_KEY not configured' };
		}

		const allowedAccountIds: string[] = await ctx.runQuery(
			components.unipile.queries.getUserAccountIds,
			{ userId: ctx.userId }
		);

		try {
			const response = await fetch(`${siteUrl}/api/sandbox/execute`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-internal-key': internalKey
				},
				body: JSON.stringify({ code: args.code, allowedAccountIds })
			});

			if (!response.ok) {
				const text = await response.text();
				return { success: false, error: `HTTP ${response.status}: ${text}` };
			}

			const result = await response.json();
			return {
				success: result.success,
				output: truncate(result.output ?? '', MAX_RESULT),
				error: result.error,
				durationMs: result.durationMs
			};
		} catch (e) {
			return {
				success: false,
				error: `Fetch failed: ${e instanceof Error ? e.message : String(e)}`
			};
		}
	}
});

export const updateTaskNotes = createTool({
	description: 'Add or update notes on a task. Include the taskId from your system prompt.',
	args: z.object({
		taskId: z.string().describe('The task ID to update'),
		notes: z.string().describe('Notes content to set on the task')
	}),
	handler: async (ctx: ToolCtx, args) => {
		if (!ctx.userId) return { success: false, error: 'No userId' };
		await ctx.runMutation(internal.todos.updateTaskNotesInternal, {
			userId: ctx.userId,
			taskId: args.taskId,
			notes: args.notes
		});
		return { success: true };
	}
});

export const createTask = createTool({
	description:
		'Create a new follow-up task, sub-task, or clarifying question as a todo on the board.',
	args: z.object({
		title: z.string().describe('Title for the new task'),
		notes: z.string().optional().describe('Optional notes or context for the task')
	}),
	handler: async (ctx: ToolCtx, args) => {
		if (!ctx.userId) return { success: false as const, error: 'No userId' };
		const taskId: string = await ctx.runMutation(internal.todos.addTaskInternal, {
			userId: ctx.userId,
			title: args.title,
			notes: args.notes
		});
		return { success: true as const, taskId };
	}
});

export const moveTask = createTool({
	description:
		'Move a task to a different column (todo, working-on, prepared, done). Include the taskId from your system prompt.',
	args: z.object({
		taskId: z.string().describe('The task ID to move'),
		columnId: z
			.enum(['todo', 'working-on', 'prepared', 'done'])
			.describe('Target column to move the task to')
	}),
	handler: async (ctx: ToolCtx, args) => {
		if (!ctx.userId) return { success: false, error: 'No userId' };
		await ctx.runMutation(internal.todos.moveTaskInternal, {
			userId: ctx.userId,
			taskId: args.taskId,
			columnId: args.columnId
		});
		return { success: true };
	}
});

export const todoAgent = new Agent(components.agent, {
	name: 'Task Assistant',

	languageModel: getTaskLanguageModel() as any,

	instructions: `You are a helpful task assistant with access to tools for managing tasks and executing Unipile SDK code directly.

Board columns: todo → working-on → prepared → done
- "todo": tasks not yet started
- "working-on": tasks you are actively researching/executing
- "prepared": tasks where all research and drafts are ready, awaiting user confirmation before final execution
- "done": completed tasks

Your responsibilities:
- Help users plan and organize their work
- Break complex tasks into actionable sub-tasks
- When a task involves Unipile operations (messaging, email, contacts), write TypeScript code and execute it using the executeUnipileCode tool
- Update task notes with findings and progress using updateTaskNotes
- Move tasks between columns using moveTask as work progresses
- Consider the user's other tasks (provided in context) when analyzing a task — avoid duplicates, notice related work

Tool usage:
- createTask: Use ONLY to ask the user for missing context or clarification. For example, if a task is vague ("plan trip"), create a task like "Decide travel dates for trip" or "Confirm budget for trip". Do NOT use it to break tasks into execution steps — that is your job, not the user's.
- executeUnipileCode: Write and execute TypeScript code that uses the Unipile SDK. You write the code yourself — see the SDK reference below.
- updateTaskNotes: Use to record findings, progress, or results on the task
- moveTask: Use to move tasks between columns

Workflow for new tasks:
1. Analyze the task title, notes, and the user's other tasks for context
2. If the task is unclear or missing key info, use createTask to ask the user what you need (e.g. "Specify budget for X", "Confirm recipient for Y")
3. Move to "working-on" and begin research/execution
4. If Unipile work is needed, use executeUnipileCode
5. Record results in task notes using updateTaskNotes
6. Move to "prepared" when research/drafts are ready for user review
7. Move to "done" only after successful execution

IMPORTANT — Failure handling:
- If a task fails (API failure, missing info), move it BACK to "todo" using moveTask
- Update the task notes explaining what went wrong and what is needed to retry
- Never leave a failed task in "working-on" or "prepared"

IMPORTANT — Style:
- Never use emojis in notes, task titles, or messages
- This is the USER's personal todo list — always write notes and titles from THEIR perspective (first person). Say "I want..." or "Need to...", never "User wants..." or "The user needs..."
- Task notes are shown directly to the user — write them in plain, non-technical language
- Keep notes short: 2-4 bullet points max, each one sentence
- Focus on findings and next steps, not implementation details or tool output
- No technical jargon, error codes, API names, or JSON in notes

---

## Unipile SDK Reference (for executeUnipileCode)

### Available Globals

The \`unipile\` object is a pre-configured SDK client with the following resources:

#### \`unipile.account\`
- \`getAll(input?: { limit?: number; cursor?: string })\` — List all connected accounts
- \`getOne(accountId: string)\` — Get a single account by ID

#### \`unipile.messaging\`
- \`getAllChats(input?: { limit?: number; cursor?: string; account_id?: string; unread?: boolean; before?: string; after?: string })\` — List chats
- \`getChat(chatId: string)\` — Get a single chat
- \`getAllMessagesFromChat(input: { chat_id: string; limit?: number; cursor?: string; before?: string; after?: string })\` — List messages in a chat
- \`getMessage(messageId: string)\` — Get a single message
- \`getAllMessages(input?: { account_id?: string; limit?: number; cursor?: string })\` — List all messages
- \`getAllAttendees(input?: { account_id?: string; limit?: number; cursor?: string })\` — List attendees
- \`getAttendee(attendeeId: string)\` — Get a single attendee
- \`sendMessage(input: { chat_id: string; text: string })\` — Send a message to a chat
- \`startNewChat(input: { account_id: string; text: string; attendees_ids: string[] })\` — Start a new chat

#### \`unipile.email\`
- \`getAll(input?: { account_id?: string; role?: string; folder?: string; from?: string; to?: string; limit?: number; cursor?: string })\` — List emails
- \`getOne(emailId: string)\` — Get a single email
- \`getAllFolders(input?: { account_id?: string })\` — List email folders
- \`send(input: { account_id: string; body: string; to: { email: string; display_name?: string }[]; subject?: string; cc?: object[]; bcc?: object[] })\` — Send an email

#### \`unipile.users\`
- \`getProfile(input: { account_id: string; identifier: string })\` — Get a user profile
- \`getOwnProfile(accountId: string)\` — Get own profile
- \`getAllRelations(input: { account_id: string; limit?: number; cursor?: string })\` — List relations
- \`getAllPosts(input: { account_id: string; identifier: string; limit?: number; cursor?: string })\` — List posts
- \`getPost(input: { account_id: string; post_id: string })\` — Get a single post

### Other Globals
- \`USER_ACCOUNT_IDS\` — Frozen array of the current user's Unipile account IDs. Use these instead of hardcoded IDs. The SDK facade is scoped to these accounts — passing a foreign account_id will throw "Access denied".
- \`console.log(...args)\` — Output results (captured and returned)
- \`fetch\`, \`JSON\`, \`Date\`, \`Promise\`, \`Buffer\`, \`URL\`, \`Headers\`, \`URLSearchParams\`, \`setTimeout\`, \`AbortController\`, \`TextEncoder\`, \`TextDecoder\`, \`FormData\`, \`Blob\`

### Rules
1. Do NOT use \`import\` or \`require\` — only the globals listed above are available
2. Use \`console.log()\` to output results
3. Use top-level await freely (the script is wrapped in an async IIFE)
4. SDK methods return parsed data directly — no \`.json()\` call needed
5. Handle errors with try/catch and log useful error messages
6. The script runs with a 15-second timeout

### Examples

**List connected accounts:**
\`\`\`typescript
const data = await unipile.account.getAll();
console.log(JSON.stringify(data, null, 2));
\`\`\`

**Get all messaging chats:**
\`\`\`typescript
const data = await unipile.messaging.getAllChats({ limit: 20 });
console.log(JSON.stringify(data, null, 2));
\`\`\`

**Send a message to a chat:**
\`\`\`typescript
const data = await unipile.messaging.sendMessage({ chat_id: 'CHAT_ID', text: 'Hello!' });
console.log(JSON.stringify(data, null, 2));
\`\`\`

**Send an email:**
\`\`\`typescript
const accountId = USER_ACCOUNT_IDS[0];
const data = await unipile.email.send({
  account_id: accountId,
  to: [{ email: 'recipient@example.com', display_name: 'Recipient' }],
  subject: 'Test Email',
  body: '<p>Hello from Promus!</p>'
});
console.log(JSON.stringify(data, null, 2));
\`\`\`

**List emails for a specific account:**
\`\`\`typescript
const data = await unipile.email.getAll({ account_id: USER_ACCOUNT_IDS[0], limit: 10 });
console.log(JSON.stringify(data, null, 2));
\`\`\``,

	tools: {
		createTask,
		executeUnipileCode,
		updateTaskNotes,
		moveTask
	},

	callSettings: {
		temperature: 0.7
	},

	contextOptions: {
		recentMessages: 20
	},

	maxSteps: 10
});
