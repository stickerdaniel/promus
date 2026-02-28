import { Agent } from '@convex-dev/agent';
import { components } from './_generated/api';
import { openrouter } from '@openrouter/ai-sdk-provider';
import './env';

/**
 * Vibe Sandbox Agent
 *
 * Used purely for thread/message storage. The actual LLM work is done by
 * the vibe CLI running inside the Daytona sandbox. We provide a model to
 * satisfy the Agent constructor, but never call streamText/generateText.
 */
export const vibeAgent = new Agent(components.agent, {
	name: 'Vibe',
	languageModel: openrouter('qwen/qwen3-vl-30b-a3b-thinking'),
	instructions: '',
	maxSteps: 1
});
