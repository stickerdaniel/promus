/**
 * Generates vibe CLI configuration files for sandbox environments.
 *
 * Uses OpenRouter (whitelisted by Daytona) to access Devstral.
 * No proxy needed — sandbox reaches openrouter.ai directly.
 */

export function getVibeConfigToml(): string {
	return `active_model = "devstral"
auto_approve = true

[[models]]
name = "mistralai/devstral-small"
provider = "openrouter"
alias = "devstral"
temperature = 0.2

[[providers]]
name = "openrouter"
api_base = "https://openrouter.ai/api/v1"
api_key_env_var = "OPENROUTER_API_KEY"
backend = "generic"
`;
}
