/**
 * Generates vibe CLI configuration files for sandbox environments.
 */

export function getVibeConfigToml(): string {
	return `[model]
provider = "mistral"
model = "mistral-large-latest"

[settings]
auto_approve = true
output = "streaming"
`;
}

export function getVibeEnvContent(mistralKey: string): string {
	return `MISTRAL_API_KEY=${mistralKey}\n`;
}
