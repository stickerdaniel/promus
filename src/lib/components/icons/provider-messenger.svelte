<script lang="ts">
	let { class: className = '' }: { class?: string } = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 73 73" class={className}>
	<defs>
		<linearGradient id="msg-grad" x1="1" x2="0" y2="0.981" gradientUnits="objectBoundingBox">
			<stop offset="0" stop-color="#f36965" />
			<stop offset="0.542" stop-color="#b03bd5" />
			<stop offset="1" stop-color="#1487f7" />
		</linearGradient>
	</defs>
	<rect width="73" height="73" rx="8" fill="url(#msg-grad)" />
	<path
		d="M29.01.563C12.983.563.563,12.276.563,28.1A26.909,26.909,0,0,0,9.5,48.462c.956.86.759,1.357.921,6.665a2.28,2.28,0,0,0,3.191,2.011c6.056-2.667,6.134-2.877,7.16-2.6,17.544,4.829,36.561-6.4,36.561-26.443C57.331,12.276,45.038.563,29.01.563ZM46.09,21.751,37.735,34.978a4.277,4.277,0,0,1-6.17,1.137L24.918,31.14a1.717,1.717,0,0,0-2.06,0l-8.97,6.8a1.349,1.349,0,0,1-1.958-1.793l8.355-13.227a4.276,4.276,0,0,1,6.17-1.137L33.1,26.759a1.717,1.717,0,0,0,2.06,0l8.974-6.8a1.346,1.346,0,0,1,1.956,1.788Z"
		transform="translate(7.553 7.555)"
		fill="#fff"
	/>
</svg>
