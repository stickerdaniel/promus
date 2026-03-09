import { test } from '@playwright/test';
import { waitForAuthenticated } from './utils/auth';

// Uses pre-authenticated session state from setup
test('signout works', async ({ page }) => {
	// Already authenticated via session state - go directly to app
	await page.goto('/app');
	await waitForAuthenticated(page);

	// Sign out — logout button is directly visible in sidebar footer
	await page.locator('[data-testid="logout-button"]').click();

	// Should redirect away from app after logout (to home or signin page)
	// With i18n, this could be /en, /en/signin, etc.
	await page.waitForURL(/.*\/[a-z]{2}(\/signin)?(\?.*)?$/, { timeout: 10000 });
});
