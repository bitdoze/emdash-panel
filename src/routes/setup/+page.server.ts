import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '#lib/server/auth/index';
import { isOwnerInitialized, validateSetupToken } from '#lib/server/auth/owner';
import { recordAudit } from '#lib/server/audit';

export const load: PageServerLoad = async () => {
	if (await isOwnerInitialized()) redirect(303, '/login');
	return {};
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		if (await isOwnerInitialized()) {
			return fail(403, { error: 'Owner account already exists' });
		}
		const form = await request.formData();
		const token = String(form.get('token') ?? '').trim();
		const name = String(form.get('name') ?? '').trim();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');

		if (!token || !(await validateSetupToken(token))) {
			return fail(403, { error: 'Invalid, expired or already-used setup token' });
		}
		if (!name || !email || password.length < 10) {
			return fail(400, { error: 'Name, email and a password of at least 10 characters are required' });
		}

		const headers = new Headers(request.headers);
		headers.set('x-emdash-setup-token', token);
		try {
			await auth.api.signUpEmail({
				body: { name, email, password },
				headers
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Sign-up failed';
			return fail(400, { error: message });
		}
		await recordAudit({
			action: 'owner.setup',
			targetType: 'user',
			metadata: { email },
			ip: getClientAddress()
		});
		redirect(303, '/dashboard');
	}
};
