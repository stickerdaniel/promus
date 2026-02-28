<script>
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { getTranslate } from '@tolgee/svelte';
	import HeroFive from '$blocks/hero/hero-five.svelte';
	const { t } = getTranslate();
</script>

<SEOHead title={$t('meta.home.title')} description={$t('meta.home.description')} />

<HeroFive />
