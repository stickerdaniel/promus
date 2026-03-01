import { Agent } from '@convex-dev/agent';
import { components } from './_generated/api';
import { getSupportLanguageModel } from './support/llmProvider';

/**
 * Vibe Sandbox Agent
 *
 * Used purely for thread/message storage. The actual LLM work is done by
 * the vibe CLI running inside the Daytona sandbox. We provide a model to
 * satisfy the Agent constructor, but never call streamText/generateText.
 */
export const vibeAgent = new Agent(components.agent, {
	name: 'Vibe',
	languageModel: getSupportLanguageModel(),
	instructions: '',
	maxSteps: 1
});
