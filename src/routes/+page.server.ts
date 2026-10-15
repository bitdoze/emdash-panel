import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isOwnerInitialized } from '#lib/server/auth/owner';

export const load: PageServerLoad = async ({ locals }) => {
	if (!(await isOwnerInitialized())) redirect(303, '/setup');
	if (!locals.user) redirect(303, '/login');
	redirect(303, '/dashboard');
};
