/**
 * Test script to measure sandbox timing without Vercel's function timeout.
 * Run: bun scripts/test-sandbox-timing.ts <sandboxId>
 *
 * Get sandboxId from the browser console:
 *   In Network tab, find a sandboxApi.getSession response
 */
import { Daytona } from '@daytonaio/sdk';

const DAYTONA_API_KEY = process.env.DAYTONA_API_KEY;
if (!DAYTONA_API_KEY) {
	console.error('Set DAYTONA_API_KEY in .env.local');
	process.exit(1);
}

const sandboxId = process.argv[2];
if (!sandboxId) {
	// List all sandboxes to find the right one
	console.log('No sandboxId provided. Listing sandboxes...\n');
	const daytona = new Daytona({ apiKey: DAYTONA_API_KEY });
	const sandboxes = await daytona.list();
	const items = Array.isArray(sandboxes)
		? sandboxes
		: ((sandboxes as any).items ?? Object.values(sandboxes));
	for (const sb of items) {
		console.log(`  ${sb.id}  state=${sb.state}  labels=${JSON.stringify(sb.labels ?? {})}`);
	}
	console.log('\nRe-run with: bun scripts/test-sandbox-timing.ts <sandboxId>');
	process.exit(0);
}

const t0 = Date.now();
const log = (msg: string) => console.log(`[${Date.now() - t0}ms] ${msg}`);

log('Connecting to Daytona...');
const daytona = new Daytona({ apiKey: DAYTONA_API_KEY });

log('Getting sandbox...');
const sandbox = await daytona.get(sandboxId);

log('Refreshing data...');
await sandbox.refreshData();
log(`Sandbox state: ${sandbox.state}`);

if (sandbox.state === 'stopped') {
	log('Restarting sandbox...');
	await sandbox.start(60);
	log('Sandbox restarted');
}

// Test file upload
const testPrompt = 'List all connected Unipile accounts';
log('Uploading prompt file...');
await sandbox.fs.uploadFile(Buffer.from(testPrompt), '/tmp/test-prompt.txt');
log('Prompt uploaded');

// Test simple command
log('Running simple command (echo test)...');
const echoResult = await sandbox.process.executeCommand(
	'echo "sandbox is alive"',
	undefined,
	undefined,
	10
);
log(`Echo result: ${(echoResult as any).result ?? (echoResult as any).output ?? 'no output'}`);

// Test vibe command (the slow part)
log('Running vibe command...');
const cmd = `. /root/.vibe-env && VIBE_PROMPT=$(cat /tmp/test-prompt.txt) && vibe -p "$VIBE_PROMPT" --output json --max-turns 2 2>&1`;
try {
	const result = await sandbox.process.executeCommand(cmd, undefined, undefined, 90);
	const output = (result as any).result ?? (result as any).output ?? '';
	log(`Vibe done. exit=${result.exitCode} output_len=${output.length}`);
	console.log('\n--- Vibe output (first 500 chars) ---');
	console.log(output.slice(0, 500));
} catch (e) {
	log(`Vibe error: ${e instanceof Error ? e.message : String(e)}`);
}

log('DONE');
