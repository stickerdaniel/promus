<script lang="ts">
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { getTranslate } from '@tolgee/svelte';
	import EmailPreview from 'better-svelte-email/preview/EmailPreview.svelte';
	import { page } from '$app/state';

	const { t } = getTranslate();

	// EmailPreview expects a mutable URL; SvelteKit types `page.url` as read-only.
	const previewPage = $derived({
		params: page.params,
		data: page.data,
		url: new URL(page.url.href)
	});
</script>

<SEOHead
	title={$t('meta.emails.preview.title')}
	description={$t('meta.emails.preview.description')}
/>

<EmailPreview page={previewPage} />
