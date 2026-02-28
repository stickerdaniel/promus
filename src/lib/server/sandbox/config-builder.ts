/**
 * Generates vibe CLI configuration files for sandbox environments.
 *
 * Supports multiple LLM providers via VIBE_LLM_PROVIDER env var:
 *   - "bedrock"    (default) — SvelteKit proxy route → AWS Bedrock (creds stay server-side)
 *   - "openrouter" — direct HTTPS to openrouter.ai
 *   - "mistral"    — direct HTTPS to api.mistral.ai (native vibe backend)
 */

export type VibeLLMProvider = 'bedrock' | 'openrouter' | 'mistral';

interface ProviderConfig {
	modelName: string;
	providerName: string;
	apiKeyEnvVar: string;
	backend: string;
}

const PROVIDER_CONFIGS: Record<VibeLLMProvider, ProviderConfig> = {
	bedrock: {
		modelName: 'mistral.devstral-2-123b',
		providerName: 'bedrock',
		apiKeyEnvVar: 'LLM_PROXY_TOKEN',
		backend: 'generic'
	},
	openrouter: {
		modelName: 'mistralai/devstral-small-2505',
		providerName: 'openrouter',
		apiKeyEnvVar: 'OPENROUTER_API_KEY',
		backend: 'generic'
	},
	mistral: {
		modelName: 'devstral-small-2505',
		providerName: 'mistral',
		apiKeyEnvVar: 'MISTRAL_API_KEY',
		backend: 'mistral'
	}
};

/**
 * Get the API base URL for bedrock provider.
 * Uses VIBE_LLM_PROXY_URL env var or falls back to localhost for local dev.
 */
export function getBedrockApiBase(proxyUrl: string): string {
	return `${proxyUrl}/api/sandbox/llm`;
}

export function getVibeConfigToml(
	provider: VibeLLMProvider = 'bedrock',
	opts?: { proxyUrl?: string }
): string {
	const cfg = PROVIDER_CONFIGS[provider];

	let apiBase: string;
	if (provider === 'bedrock') {
		apiBase = getBedrockApiBase(opts?.proxyUrl || 'http://localhost:5173');
	} else if (provider === 'openrouter') {
		apiBase = 'https://openrouter.ai/api/v1';
	} else {
		apiBase = 'https://api.mistral.ai/v1';
	}

	return `active_model = "devstral"
auto_approve = true

[[models]]
name = "${cfg.modelName}"
provider = "${cfg.providerName}"
alias = "devstral"
temperature = 0.2

[[providers]]
name = "${cfg.providerName}"
api_base = "${apiBase}"
api_key_env_var = "${cfg.apiKeyEnvVar}"
backend = "${cfg.backend}"
`;
}

export function needsBedrockProxy(_provider: VibeLLMProvider): boolean {
	// Bedrock proxy now runs server-side as a SvelteKit route — never in the sandbox
	return false;
}
