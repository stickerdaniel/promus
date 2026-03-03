<script lang="ts">
	import SEOHead from '$lib/components/SEOHead.svelte';
	import { getTranslate } from '@tolgee/svelte';
	import KanbanBoard from '$lib/components/todo-demo/kanban-board.svelte';

	const { t } = getTranslate();
</script>

<SEOHead
	title={$t('meta.app.dashboard.title')}
	description={$t('meta.app.dashboard.description')}
/>

<div class="px-4 py-6 lg:px-6">
	<KanbanBoard />
</div>
