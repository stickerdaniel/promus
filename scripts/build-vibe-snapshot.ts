import { Daytona, Image } from '@daytonaio/sdk';

const SNAPSHOT_NAME = 'promus-vibe';

async function main(): Promise<void> {
	if (!process.env.DAYTONA_API_KEY) {
		console.error('Missing DAYTONA_API_KEY environment variable');
		process.exit(1);
	}

	console.log('Initializing Daytona SDK...');
	const daytona = new Daytona();

	const image = Image.base('python:3.12-slim').runCommands(
		'apt-get update && apt-get install -y --no-install-recommends git curl ripgrep && rm -rf /var/lib/apt/lists/*',
		'curl -LsSf https://astral.sh/uv/install.sh | sh',
		'/root/.local/bin/uv pip install --system mistral-vibe starlette uvicorn sse-starlette boto3',
		'curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*',
		'cd /root && npm init -y && npm install unipile-node-sdk@1.9.3 typescript@5.9.3'
	);

	console.log(`Creating snapshot: ${SNAPSHOT_NAME}`);
	console.log('This may take a few minutes...\n');

	const snapshot = await daytona.snapshot.create(
		{ name: SNAPSHOT_NAME, image },
		{ onLogs: (log) => console.log('[snapshot]', log) }
	);

	console.log('\nSnapshot created successfully!');
	console.log(`Name: ${snapshot.name}`);
	console.log(`State: ${snapshot.state}`);
}

if (import.meta.main) {
	main().catch((error) => {
		console.error('Error:', error);
		process.exit(1);
	});
}
