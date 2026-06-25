import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { encryptSecret } from '../../../lib/crypto';
import { json, badRequest } from '../../../lib/http';

export const prerender = false;

// List configs without exposing any secret material.
export const GET: APIRoute = async () => {
	const { results } = await env.DB.prepare(
		'SELECT id, alias, region, bucket, prefix, access_key_id, created_at FROM configs ORDER BY alias',
	).all();
	return json(results);
};

// Create a new config; the secret access key is encrypted before storage.
export const POST: APIRoute = async ({ request }) => {
	const body = (await request.json()) as Record<string, string>;
	const alias = (body.alias ?? '').trim();
	const region = (body.region ?? '').trim();
	const bucket = (body.bucket ?? '').trim();
	const prefix = (body.prefix ?? '').trim();
	const accessKeyId = (body.accessKeyId ?? '').trim();
	const secretAccessKey = (body.secretAccessKey ?? '').trim();

	if (!alias || !region || !bucket || !accessKeyId || !secretAccessKey) {
		return badRequest('alias、region、bucket、accessKeyId、secretAccessKey 均为必填');
	}

	const { cipher, iv } = await encryptSecret(secretAccessKey, env.ENCRYPTION_KEY);
	const res = await env.DB.prepare(
		`INSERT INTO configs (alias, region, bucket, prefix, access_key_id, secret_access_key_enc, secret_iv, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(alias, region, bucket, prefix, accessKeyId, cipher, iv, Date.now())
		.run();

	return json({ id: res.meta.last_row_id }, 201);
};
