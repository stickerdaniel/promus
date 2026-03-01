<script>
	import { T } from '@tolgee/svelte';
	import { localizedHref } from '$lib/utils/i18n';
	import Marquee from '../magic/Marquee.svelte';
	import ProgressiveBlur from '../magic/ProgressiveBlur.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import HeroOctopusAnimation from './hero-octopus-animation.svelte';
	import nvidiaLogo from './logos/nvidia.svg';
	import awsLightLogo from './logos/aws-light.svg';
	import awsDarkLogo from './logos/aws-dark.svg';
	import elevenlabsLightLogo from './logos/elevenlabs-light.svg';
	import elevenlabsDarkLogo from './logos/elevenlabs-dark.svg';
	import mistralLightLogo from './logos/mistral-light.svg';
	import hfLightLogo from './logos/hf-light.svg';
	import hfDarkLogo from './logos/hf-dark.svg';
	import wandbLightLogo from './logos/wandb-light.svg';
	import wandbDarkLogo from './logos/wandb-dark.svg';
	import orbmarkLightLogo from './logos/orbmark-light.svg';
	import orbmarkDarkLogo from './logos/orbmark-dark.svg';
	import supercellLightLogo from './logos/supercell-light.svg';
	import supercellDarkLogo from './logos/supercell-dark.svg';
</script>

<main class="overflow-hidden">
	<section class="flex items-center justify-center">
		<div class="w-full pt-20 pb-24 lg:pt-40 lg:pb-28">
			<div
				class="relative mx-auto grid max-w-6xl grid-cols-1 items-center px-6 lg:grid-cols-2 lg:gap-12 lg:px-12"
			>
				<div class="mx-auto max-w-lg text-center lg:ml-0 lg:max-w-full lg:text-left">
					<h1 class="mt-8 max-w-4xl text-4xl font-bold md:text-5xl lg:mt-16 xl:text-6xl">
						<T keyName="hero.tagline" />
					</h1>
					<p class="mt-8 max-w-3xl text-lg text-balance">
						<T keyName="hero.description" />
					</p>
					<div
						class="mt-12 flex flex-col items-center justify-center gap-2 sm:flex-row lg:justify-start"
					>
						<Button
							size="lg"
							href={localizedHref('/signin?tab=signup')}
							class="h-12 rounded-full pr-3 pl-5 text-sm"
						>
							<span class="text-nowrap"><T keyName="hero.cta" /></span>
							<ChevronRight class="ml-1" />
						</Button>
						<Button
							size="lg"
							variant="ghost"
							href="https://github.com/stickerdaniel/promus"
							target="_blank"
							rel="noopener noreferrer"
							class="h-12 rounded-full px-5 text-base hover:bg-zinc-950/5 dark:hover:bg-white/5"
						>
							<span class="text-nowrap">
								<T keyName="hero.cta_sourcecode" defaultValue="View sourcecode" />
							</span>
						</Button>
					</div>
				</div>
				<div class="hidden lg:flex lg:items-center lg:justify-end">
					<HeroOctopusAnimation />
				</div>
			</div>
		</div>
	</section>
	<section>
		<div class="group relative m-auto max-w-6xl px-6">
			<div class="flex flex-col items-center md:flex-row">
				<div class="md:max-w-44 md:border-r md:pr-6">
					<p class="text-end text-sm"><T keyName="hero.companies_text" /></p>
				</div>
				<div class="relative py-6 md:w-[calc(100%-11rem)]">
					<Marquee>
						<div class="flex h-8 items-center">
							<img
								class="h-4 w-auto shrink-0 object-contain dark:invert"
								src={nvidiaLogo}
								alt="NVIDIA Logo"
								height="16"
								width="auto"
							/>
						</div>
						<div class="flex h-8 items-center">
							<img
								class="h-6 w-auto shrink-0 object-contain dark:hidden"
								src={awsLightLogo}
								alt="AWS Logo"
								height="24"
								width="auto"
							/>
							<img
								class="hidden h-6 w-auto shrink-0 object-contain dark:block"
								src={awsDarkLogo}
								alt="AWS Logo"
								height="24"
								width="auto"
							/>
						</div>
						<div class="flex h-8 items-center">
							<img
								class="h-3.5 w-auto shrink-0 object-contain dark:hidden"
								src={elevenlabsLightLogo}
								alt="ElevenLabs Logo"
								height="14"
								width="auto"
							/>
							<img
								class="hidden h-3.5 w-auto shrink-0 object-contain dark:block"
								src={elevenlabsDarkLogo}
								alt="ElevenLabs Logo"
								height="14"
								width="auto"
							/>
						</div>
						<div class="flex h-8 items-center">
							<img
								class="h-5 w-auto shrink-0 object-contain dark:invert"
								src={mistralLightLogo}
								alt="Mistral Logo"
								height="20"
								width="auto"
							/>
						</div>
						<div class="flex h-8 items-center">
							<img
								class="h-6 w-auto shrink-0 object-contain dark:hidden"
								src={hfLightLogo}
								alt="Hugging Face Logo"
								height="24"
								width="auto"
							/>
							<img
								class="hidden h-6 w-auto shrink-0 object-contain dark:block"
								src={hfDarkLogo}
								alt="Hugging Face Logo"
								height="24"
								width="auto"
							/>
						</div>
						<div class="flex h-8 items-center">
							<img
								class="h-5 w-auto shrink-0 object-contain dark:hidden"
								src={wandbLightLogo}
								alt="Weights & Biases Logo"
								height="20"
								width="auto"
							/>
							<img
								class="hidden h-5 w-auto shrink-0 object-contain dark:block"
								src={wandbDarkLogo}
								alt="Weights & Biases Logo"
								height="20"
								width="auto"
							/>
						</div>
						<div class="flex h-8 items-center">
							<img
								class="h-5 w-auto shrink-0 object-contain dark:hidden"
								src={orbmarkLightLogo}
								alt="Orbmark Logo"
								height="20"
								width="auto"
							/>
							<img
								class="hidden h-5 w-auto shrink-0 object-contain dark:block"
								src={orbmarkDarkLogo}
								alt="Orbmark Logo"
								height="20"
								width="auto"
							/>
						</div>
						<div class="flex h-8 items-center">
							<img
								class="h-7 w-auto shrink-0 object-contain dark:hidden"
								src={supercellLightLogo}
								alt="Supercell Logo"
								height="28"
								width="auto"
							/>
							<img
								class="hidden h-7 w-auto shrink-0 object-contain dark:block"
								src={supercellDarkLogo}
								alt="Supercell Logo"
								height="28"
								width="auto"
							/>
						</div>
					</Marquee>

					<div class="absolute inset-y-0 left-0 w-20 bg-linear-to-r from-background"></div>
					<div class="absolute inset-y-0 right-0 w-20 bg-linear-to-l from-background"></div>
					<ProgressiveBlur
						class="pointer-events-none absolute top-0 left-0 z-10 h-full w-20"
						direction="left"
						blurIntensity={1}
					/>
					<ProgressiveBlur
						class="pointer-events-none absolute top-0 right-0 z-10 h-full w-20"
						direction="right"
						blurIntensity={1}
					/>
				</div>
			</div>
		</div>
	</section>
</main>
