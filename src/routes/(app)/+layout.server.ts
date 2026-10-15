import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isOwnerInitialized } from '#lib/server/auth/owner';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!(await isOwnerInitialized())) redirect(303, '/setup');
	if (!locals.user) redirect(303, '/login');
	return {
		user: { name: locals.user.name, email: locals.user.email }
	};
};
