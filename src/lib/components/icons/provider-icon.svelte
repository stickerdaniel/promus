<script lang="ts">
	import ProviderLinkedin from './provider-linkedin.svelte';
	import ProviderWhatsapp from './provider-whatsapp.svelte';
	import ProviderInstagram from './provider-instagram.svelte';
	import ProviderMessenger from './provider-messenger.svelte';
	import ProviderTelegram from './provider-telegram.svelte';
	import ProviderTwitter from './provider-twitter.svelte';
	import ProviderGoogle from './provider-google.svelte';
	import ProviderMail from './provider-mail.svelte';
	import ProviderOutlook from './provider-outlook.svelte';
	import LinkIcon from '@lucide/svelte/icons/link';

	let { type, class: className = 'size-full' }: { type: string; class?: string } = $props();

	const icons: Record<string, typeof ProviderLinkedin> = {
		LINKEDIN: ProviderLinkedin,
		WHATSAPP: ProviderWhatsapp,
		INSTAGRAM: ProviderInstagram,
		MESSENGER: ProviderMessenger,
		TELEGRAM: ProviderTelegram,
		TWITTER: ProviderTwitter,
		GOOGLE_OAUTH: ProviderGoogle,
		GOOGLE: ProviderGoogle,
		GOOGLE_CALENDAR: ProviderGoogle,
		MAIL: ProviderMail,
		IMAP: ProviderMail,
		EXCHANGE: ProviderOutlook,
		OUTLOOK: ProviderOutlook
	};

	let Icon = $derived(icons[type.toUpperCase()]);
</script>

{#if Icon}
	<Icon class={className} />
{:else}
	<LinkIcon class={className} />
{/if}
