import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { json, badRequest } from '../../../lib/http';

export const prerender = false;

// List cached email metadata for a config, newest first.
export const GET: APIRoute = async ({ url }) => {
	const configId = Number(url.searchParams.get('configId'));
	if (!configId) return badRequest('configId required');

	const { results } = await env.DB.prepare(
		`SELECT id, to_addr, from_addr, subject, date, size
		 FROM emails WHERE config_id = ?
		 ORDER BY date DESC, id DESC`,
	)
		.bind(configId)
		.all();

	return json(results);
};
