import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { signSession } from '../../lib/crypto';
import { SESSION_COOKIE } from '../../middleware';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
	const form = await request.formData();
	const password = String(form.get('password') ?? '');

	if (!env.APP_PASSWORD || password !== env.APP_PASSWORD) {
		return redirect('/login?error=1');
	}

	const token = await signSession(env.SESSION_SECRET);
	cookies.set(SESSION_COOKIE, token, {
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		path: '/',
		maxAge: 7 * 24 * 60 * 60,
	});
	return redirect('/');
};
