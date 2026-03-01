import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { openrouter } from '@openrouter/ai-sdk-provider';

 
export function getSupportLanguageModel(): any {
	const provider = process.env.SUPPORT_LLM_PROVIDER ?? 'bedrock';

	if (provider === 'openrouter') {
		return openrouter('qwen/qwen3-vl-30b-a3b-thinking');
	}

	// Default: Bedrock (reads AWS_BEARER_TOKEN_BEDROCK env var automatically)
	const bedrock = createAmazonBedrock({
		region: process.env.AWS_REGION ?? 'us-west-2'
	});

	return bedrock('us.anthropic.claude-sonnet-4-6');
}

 
export function getTaskLanguageModel(): any {
	const bedrock = createAmazonBedrock({
		region: process.env.AWS_REGION ?? 'us-west-2'
	});

	return bedrock('us.anthropic.claude-opus-4-6-v1');
}
