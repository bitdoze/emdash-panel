// Better Auth server configuration. Server-only module — do not import from
// client code or from the worker (the worker creates setup tokens directly
// against the database instead).
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { APIError } from 'better-auth/api';
import { passkey } from '@better-auth/passkey';
import { getRequestEvent } from '$app/server';
import { db } from '../db/index.js';
import { env, envOpt } from '../env.js';
import { consumeSetupToken } from './owner.js';

const origin = env('ORIGIN');
const panelHostname = new URL(origin).hostname;

export const auth = betterAuth({
	baseURL: origin,
	secret: env('BETTER_AUTH_SECRET'),
	trustedOrigins: [origin],
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: {
		enabled: true,
		// sign-up is additionally gated by the user.create database hook below:
		// the first account requires a valid single-use setup token, and no
		// further accounts can be registered afterwards (single-administrator
		// trust model).
		requireEmailVerification: false
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
		cookieCache: { enabled: true, maxAge: 5 * 60 }
	},
	rateLimit: {
		enabled: true,
		window: 60,
		max: 120,
		customRules: {
			'/sign-in/email': { window: 60, max: 10 },
			'/sign-up/email': { window: 60, max: 10 },
			'/forget-password': { window: 60, max: 5 }
		}
	},
	databaseHooks: {
		user: {
			create: {
				before: async (_user, ctx) => {
					const token = ctx?.headers?.get('x-emdash-setup-token') ?? '';
					const ok = await consumeSetupToken(token);
					if (!ok) {
						throw new APIError('FORBIDDEN', {
							message: 'Registration is disabled. Owner setup requires a valid setup token.'
						});
					}
				}
			}
		}
	},
	plugins: [
		passkey({
			rpID: envOpt('PASSKEY_RP_ID', panelHostname),
			rpName: envOpt('PASSKEY_RP_NAME', 'EmDash Panel'),
			origin
		}),
		sveltekitCookies(getRequestEvent) // keep last
	]
});
