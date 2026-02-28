import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ url }) => {
	redirect(302, `${url.pathname}/my-tasks${url.search}`);
}) satisfies PageServerLoad;
