import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { verifySession } from './lib/crypto';

export const SESSION_COOKIE = 'ses_session';

// Paths that must remain reachable without a session.
const PUBLIC_PATHS = new Set(['/login', '/api/login']);

function isAsset(pathname: string): boolean {
	return (
		pathname.startsWith('/_astro/') ||
		pathname.startsWith('/_image') ||
		pathname === '/favicon.ico' ||
		pathname === '/favicon.svg'
	);
}

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url;
	if (isAsset(pathname) || PUBLIC_PATHS.has(pathname)) {
		return next();
	}

	const token = context.cookies.get(SESSION_COOKIE)?.value;
	const authed = await verifySession(token, env.SESSION_SECRET);

	if (!authed) {
		if (pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' },
			});
		}
		return context.redirect('/login');
	}

	return next();
});
