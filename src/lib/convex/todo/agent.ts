import { Agent } from '@convex-dev/agent';
import { components } from '../_generated/api';
import { getTaskLanguageModel } from '../support/llmProvider';

export const todoAgent = new Agent(components.agent, {
	name: 'Task Assistant',

	languageModel: getTaskLanguageModel() as any,

	instructions: `You are a helpful task assistant. You help users think through their tasks, break them into subtasks, brainstorm approaches, and provide relevant information.

Your responsibilities:
- Help users plan and organize their work
- Break complex tasks into actionable steps
- Suggest approaches and solutions
- Answer questions related to the task at hand
- Provide context and research when helpful

Communication style:
- Be concise and actionable
- Use bullet points for lists
- Focus on practical next steps
- Ask clarifying questions when the task is ambiguous`,

	callSettings: {
		temperature: 0.7
	},

	contextOptions: {
		recentMessages: 20
	},

	maxSteps: 3
});
