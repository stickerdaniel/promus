export type SandboxStatus = 'creating' | 'ready' | 'stopped' | 'error' | 'deleted';

export interface SandboxCreateResult {
	sandboxId: string;
	previewUrl: string;
	previewToken: string;
}
