import { describe, expect, it } from 'vitest';
import { siteRoute } from './caddy.js';

interface Route {
	'@id'?: string;
	match?: Array<Record<string, unknown>>;
	handle?: Array<Record<string, unknown>>;
	terminal?: boolean;
	[key: string]: unknown;
}

const GATE = { username: 'owner', bcryptHash: '$2a$10$fakehashfakehashfakehashfa' };

describe('siteRoute', () => {
	it('emits a single host-matched proxy route without a gate', () => {
		const routes = siteRoute({
			siteId: 'abc',
			hostnames: ['a.example.com'],
			upstream: 'ems-site-abc:4321'
		}) as Route[];
		expect(routes).toHaveLength(1);
		expect(routes[0]['@id']).toBe('site-abc');
		expect(routes[0].match).toEqual([{ host: ['a.example.com'] }]);
		expect(routes[0].terminal).toBe(true);
		const proxy = routes[0].handle![0] as { handler: string; upstreams: { dial: string }[] };
		expect(proxy.handler).toBe('reverse_proxy');
		expect(proxy.upstreams[0].dial).toBe('ems-site-abc:4321');
	});

	it('sorts multiple hostnames into one matcher', () => {
		const routes = siteRoute({
			siteId: 'abc',
			hostnames: ['b.example.com', 'a.example.com', 'c.example.com'],
			upstream: 'x:4321'
		}) as Route[];
		expect(routes).toHaveLength(1);
		expect(routes[0].match).toEqual([
			{ host: ['a.example.com', 'b.example.com', 'c.example.com'] }
		]);
	});

	it('places the gate route before the catch-all when gating', () => {
		const routes = siteRoute({
			siteId: 'abc',
			hostnames: ['a.example.com'],
			upstream: 'x:4321',
			gate: GATE
		}) as Route[];
		expect(routes).toHaveLength(2);
		expect(routes[0]['@id']).toBe('site-abc-gate');
		expect(routes[1]['@id']).toBe('site-abc');
	});

	it('ANDs host and path in a single matcher object', () => {
		const [gate] = siteRoute({
			siteId: 'abc',
			hostnames: ['a.example.com'],
			upstream: 'x:4321',
			gate: GATE
		}) as Route[];
		expect(gate.match).toEqual([{ host: ['a.example.com'], path: ['/_emdash*'] }]);
	});

	it('wraps authentication in a subroute so proxying happens after auth', () => {
		const [gate] = siteRoute({
			siteId: 'abc',
			hostnames: ['a.example.com'],
			upstream: 'x:4321',
			gate: GATE
		}) as Route[];
		const outer = gate.handle![0] as { handler: string; routes: Route[] };
		expect(outer.handler).toBe('subroute');
		const authRoute = outer.routes[0].handle![0] as {
			handler: string;
			providers: { http_basic: { accounts: { username: string }[] } };
		};
		expect(authRoute.handler).toBe('authentication');
		expect(authRoute.providers.http_basic.accounts[0].username).toBe('owner');
		const proxyRoute = outer.routes[1].handle![0] as { handler: string };
		expect(proxyRoute.handler).toBe('reverse_proxy');
	});
});
