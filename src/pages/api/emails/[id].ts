import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { resolveConfig } from '../../../lib/config';
import { getObject } from '../../../lib/s3';
import { parseFull, sanitizeHtml } from '../../../lib/mail';
import { json, badRequest, notFound } from '../../../lib/http';
import type { ConfigRow, EmailRow } from '../../../lib/types';

export const prerender = false;

// Fetch the raw object from S3 and return the parsed body + attachment list.
export const GET: APIRoute = async ({ params }) => {
	const id = Number(params.id);
	if (!id) return badRequest('invalid id');

	const email = (await env.DB.prepare('SELECT * FROM emails WHERE id = ?')
		.bind(id)
		.first()) as EmailRow | null;
	if (!email) return notFound();

	const row = (await env.DB.prepare('SELECT * FROM configs WHERE id = ?')
		.bind(email.config_id)
		.first()) as ConfigRow | null;
	if (!row) return notFound('config missing');

	const config = await resolveConfig(row, env.ENCRYPTION_KEY);

	let full;
	try {
		const raw = await getObject(config, email.s3_key);
		full = await parseFull(raw);
	} catch (err) {
		return json({ error: String(err) }, 502);
	}

	const html = full.html ? await sanitizeHtml(full.html) : null;

	return json({
		id: email.id,
		from: full.from,
		to: full.to,
		subject: full.subject,
		date: full.date ?? email.date,
		html,
		text: full.text,
		attachments: full.attachments,
	});
};
