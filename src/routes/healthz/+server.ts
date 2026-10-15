import type { RequestHandler } from './$types';

// Public health endpoint used by the installer and container healthchecks.
// Returns no sensitive data.
export const GET: RequestHandler = async () => {
	return new Response(JSON.stringify({ ok: true }), {
		headers: { 'content-type': 'application/json' }
	});
};
