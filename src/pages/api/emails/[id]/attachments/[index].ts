import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { resolveConfig } from '../../../../../lib/config';
import { getObject } from '../../../../../lib/s3';
import { getAttachment } from '../../../../../lib/mail';
import { badRequest, notFound } from '../../../../../lib/http';
import type { ConfigRow, EmailRow } from '../../../../../lib/types';

export const prerender = false;

// Stream a single attachment back to the browser as a download.
export const GET: APIRoute = async ({ params }) => {
	const id = Number(params.id);
	const index = Number(params.index);
	if (!id || Number.isNaN(index)) return badRequest('invalid id/index');

	const email = (await env.DB.prepare('SELECT * FROM emails WHERE id = ?')
		.bind(id)
		.first()) as EmailRow | null;
	if (!email) return notFound();

	const row = (await env.DB.prepare('SELECT * FROM configs WHERE id = ?')
		.bind(email.config_id)
		.first()) as ConfigRow | null;
	if (!row) return notFound('config missing');

	const config = await resolveConfig(row, env.ENCRYPTION_KEY);
	const raw = await getObject(config, email.s3_key);
	const att = await getAttachment(raw, index);
	if (!att) return notFound('attachment not found');

	const filename = encodeURIComponent(att.filename);
	return new Response(att.content, {
		headers: {
			'content-type': att.mimeType,
			'content-disposition': `attachment; filename*=UTF-8''${filename}`,
		},
	});
};
