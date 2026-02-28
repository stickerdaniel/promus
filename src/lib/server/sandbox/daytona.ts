import { Daytona } from '@daytonaio/sdk';
import { env } from '$env/dynamic/private';

let instance: Daytona | null = null;

export function getDaytona(): Daytona {
	if (!instance) {
		if (!env.DAYTONA_API_KEY) {
			throw new Error('DAYTONA_API_KEY environment variable is required');
		}
		instance = new Daytona({
			apiKey: env.DAYTONA_API_KEY,
			apiUrl: env.DAYTONA_API_URL || undefined
		});
	}
	return instance;
}
