import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '#lib/server/auth/index';
import { isOwnerInitialized } from '#lib/server/auth/owner';

export const load: PageServerLoad = async ({ locals }) => {
	if (!(await isOwnerInitialized())) redirect(303, '/setup');
	if (locals.user) redirect(303, '/dashboard');
	return {};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		try {
			await auth.api.signInEmail({
				body: { email, password },
				headers: request.headers
			});
		} catch {
			return fail(401, { error: 'Invalid email or password' });
		}
		redirect(303, '/dashboard');
	}
};
