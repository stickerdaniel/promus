import { schema } from '$lib/components/json-render/schema.js';
import { z } from 'zod';

export const taskCatalog = schema.createCatalog({
	components: {
		Stack: {
			props: z.object({
				direction: z.enum(['horizontal', 'vertical']).nullable(),
				gap: z.enum(['sm', 'md', 'lg']).nullable(),
				wrap: z.boolean().nullable()
			}),
			slots: ['default'],
			description: 'Flex layout container'
		},

		Card: {
			props: z.object({
				title: z.string().nullable(),
				description: z.string().nullable()
			}),
			slots: ['default'],
			description: 'Card container with optional title and description'
		},

		Grid: {
			props: z.object({
				columns: z.enum(['1', '2', '3', '4']).nullable(),
				gap: z.enum(['sm', 'md', 'lg']).nullable()
			}),
			slots: ['default'],
			description: 'Responsive grid layout container'
		},

		Heading: {
			props: z.object({
				text: z.string(),
				level: z.enum(['h1', 'h2', 'h3', 'h4']).nullable()
			}),
			description: 'Section heading'
		},

		Text: {
			props: z.object({
				content: z.string(),
				muted: z.boolean().nullable()
			}),
			description: 'Text content'
		},

		Badge: {
			props: z.object({
				text: z.string(),
				variant: z.enum(['default', 'secondary', 'destructive', 'outline']).nullable()
			}),
			description: 'Status badge'
		},

		Alert: {
			props: z.object({
				variant: z.enum(['default', 'destructive']).nullable(),
				title: z.string(),
				description: z.string().nullable()
			}),
			description: 'Alert or info message'
		},

		Separator: {
			props: z.object({}),
			description: 'Visual divider'
		},

		Metric: {
			props: z.object({
				label: z.string(),
				value: z.string(),
				detail: z.string().nullable(),
				trend: z.enum(['up', 'down', 'neutral']).nullable()
			}),
			description: 'Single metric display with label, value, and optional trend indicator'
		},

		Table: {
			props: z.object({
				data: z.array(z.record(z.string(), z.unknown())),
				columns: z.array(z.object({ key: z.string(), label: z.string() })),
				emptyMessage: z.string().nullable()
			}),
			description: 'Data table with sortable columns'
		},

		Link: {
			props: z.object({
				text: z.string(),
				href: z.string()
			}),
			description: 'External link that opens in a new tab'
		},

		Button: {
			props: z.object({
				label: z.string(),
				variant: z.enum(['default', 'secondary', 'destructive', 'outline', 'ghost']).nullable(),
				size: z.enum(['default', 'sm', 'lg']).nullable(),
				disabled: z.boolean().nullable()
			}),
			description: 'Clickable button. Use with on.press to trigger actions like setState.'
		},

		TextInput: {
			props: z.object({
				label: z.string().nullable(),
				value: z.string().nullable(),
				placeholder: z.string().nullable()
			}),
			description: 'Text input field. Use { "$bindState": "/path" } for two-way binding.'
		},

		Progress: {
			props: z.object({
				value: z.number(),
				max: z.number().nullable()
			}),
			description: 'Progress bar'
		}
	},

	actions: {}
});
