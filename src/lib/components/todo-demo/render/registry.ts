import { defineRegistry } from '$lib/components/json-render/renderer.js';
import { taskCatalog } from './catalog.js';

import StackComponent from './components/Stack.svelte';
import CardComponent from './components/Card.svelte';
import GridComponent from './components/Grid.svelte';
import HeadingComponent from './components/Heading.svelte';
import TextComponent from './components/Text.svelte';
import BadgeComponent from './components/Badge.svelte';
import AlertComponent from './components/Alert.svelte';
import SeparatorComponent from './components/Separator.svelte';
import MetricComponent from './components/Metric.svelte';
import TableComponent from './components/Table.svelte';
import LinkComponent from './components/Link.svelte';
import ButtonComponent from './components/Button.svelte';
import TextInputComponent from './components/TextInput.svelte';
import ProgressComponent from './components/Progress.svelte';

const components = {
	Stack: StackComponent,
	Card: CardComponent,
	Grid: GridComponent,
	Heading: HeadingComponent,
	Text: TextComponent,
	Badge: BadgeComponent,
	Alert: AlertComponent,
	Separator: SeparatorComponent,
	Metric: MetricComponent,
	Table: TableComponent,
	Link: LinkComponent,
	Button: ButtonComponent,
	TextInput: TextInputComponent,
	Progress: ProgressComponent
};

export const { registry } = defineRegistry(taskCatalog, { components });
