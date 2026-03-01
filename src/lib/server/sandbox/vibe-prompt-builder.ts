/**
 * Builds an augmented prompt for vibe that includes Unipile SDK context.
 *
 * The prompt instructs vibe to write executable TypeScript to /root/task.ts
 * using the injected `unipile` SDK facade (pre-configured client).
 */
export function buildVibePrompt(userPrompt: string): string {
	return `${SYSTEM_CONTEXT}

## User Request

${userPrompt}`;
}

const SYSTEM_CONTEXT = `## Execution Environment

You have access to a pre-configured Unipile SDK client. To interact with it, write a TypeScript file at \`/root/task.ts\` that will be automatically executed after you finish.

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
- \`console.log(...args)\` — Output results (captured and returned to the user)
- \`fetch\`, \`JSON\`, \`Date\`, \`Promise\`, \`Buffer\`, \`URL\`, \`Headers\`, \`URLSearchParams\`, \`setTimeout\`, \`AbortController\`, \`TextEncoder\`, \`TextDecoder\`, \`FormData\`, \`Blob\`

### Rules

1. Write executable TypeScript code to \`/root/task.ts\`
2. Do NOT use \`import\` or \`require\` — only the globals listed above are available
3. Use \`console.log()\` to output results for the user
4. Use top-level await freely (the script is wrapped in an async IIFE)
5. SDK methods return parsed data directly — no \`.json()\` call needed
6. Handle errors with try/catch and log useful error messages

### SDK Examples

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

**Get messages from a specific chat:**
\`\`\`typescript
const data = await unipile.messaging.getAllMessagesFromChat({ chat_id: 'CHAT_ID', limit: 10 });
console.log(JSON.stringify(data, null, 2));
\`\`\`

**Send a message to a chat:**
\`\`\`typescript
const data = await unipile.messaging.sendMessage({ chat_id: 'CHAT_ID', text: 'Hello from Promus!' });
console.log(JSON.stringify(data, null, 2));
\`\`\`

**Send an email:**
\`\`\`typescript
const data = await unipile.email.send({
  account_id: 'ACCOUNT_ID',
  to: [{ email: 'recipient@example.com', display_name: 'Recipient' }],
  subject: 'Test Email',
  body: '<p>Hello from Promus!</p>'
});
console.log(JSON.stringify(data, null, 2));
\`\`\`

**List emails:**
\`\`\`typescript
const data = await unipile.email.getAll({ limit: 10 });
console.log(JSON.stringify(data, null, 2));
\`\`\`

### Important

- The script runs on the server with a 15-second timeout
- Write the file to exactly \`/root/task.ts\` — this path is required
- Always output results via \`console.log()\` so the user can see them
- SDK methods return parsed data — do not call \`.json()\` on their results`;
