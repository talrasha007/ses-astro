import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { encryptSecret } from '../../../lib/crypto';
import { json, badRequest, notFound } from '../../../lib/http';

export const prerender = false;

// Update a config. An empty secretAccessKey means "leave the stored secret unchanged".
export const PUT: APIRoute = async ({ params, request }) => {
	const id = Number(params.id);
	if (!id) return badRequest('invalid id');

	const existing = await env.DB.prepare('SELECT id FROM configs WHERE id = ?')
		.bind(id)
		.first();
	if (!existing) return notFound();

	const body = (await request.json()) as Record<string, string>;
	const alias = (body.alias ?? '').trim();
	const region = (body.region ?? '').trim();
	const bucket = (body.bucket ?? '').trim();
	const prefix = (body.prefix ?? '').trim();
	const accessKeyId = (body.accessKeyId ?? '').trim();
	const secretAccessKey = (body.secretAccessKey ?? '').trim();

	if (!alias || !region || !bucket || !accessKeyId) {
		return badRequest('alias、region、bucket、accessKeyId 均为必填');
	}

	if (secretAccessKey) {
		const { cipher, iv } = await encryptSecret(secretAccessKey, env.ENCRYPTION_KEY);
		await env.DB.prepare(
			`UPDATE configs SET alias=?, region=?, bucket=?, prefix=?, access_key_id=?, secret_access_key_enc=?, secret_iv=? WHERE id=?`,
		)
			.bind(alias, region, bucket, prefix, accessKeyId, cipher, iv, id)
			.run();
	} else {
		await env.DB.prepare(
			`UPDATE configs SET alias=?, region=?, bucket=?, prefix=?, access_key_id=? WHERE id=?`,
		)
			.bind(alias, region, bucket, prefix, accessKeyId, id)
			.run();
	}

	return json({ ok: true });
};

// Delete a config; cached emails cascade via the FK constraint.
export const DELETE: APIRoute = async ({ params }) => {
	const id = Number(params.id);
	if (!id) return badRequest('invalid id');
	await env.DB.prepare('DELETE FROM emails WHERE config_id = ?').bind(id).run();
	await env.DB.prepare('DELETE FROM configs WHERE id = ?').bind(id).run();
	return json({ ok: true });
};
