import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { resolveConfig } from '../../../../lib/config';
import { listObjects, getObject } from '../../../../lib/s3';
import { parseMeta } from '../../../../lib/mail';
import { json, badRequest, notFound } from '../../../../lib/http';
import type { ConfigRow } from '../../../../lib/types';

export const prerender = false;

// Incrementally cache email metadata: list the prefix, and for every object
// not yet in the `emails` table, fetch + parse it and store the metadata.
export const POST: APIRoute = async ({ params }) => {
	const id = Number(params.id);
	if (!id) return badRequest('invalid id');

	const row = (await env.DB.prepare('SELECT * FROM configs WHERE id = ?')
		.bind(id)
		.first()) as ConfigRow | null;
	if (!row) return notFound();

	const config = await resolveConfig(row, env.ENCRYPTION_KEY);

	let objects;
	try {
		objects = await listObjects(config);
	} catch (err) {
		return json({ error: String(err) }, 502);
	}

	const cached = await env.DB.prepare(
		'SELECT s3_key FROM emails WHERE config_id = ?',
	)
		.bind(id)
		.all();
	const known = new Set((cached.results as { s3_key: string }[]).map((r) => r.s3_key));

	const pending = objects.filter((o) => !known.has(o.key));
	let added = 0;
	const errors: string[] = [];

	for (const obj of pending) {
		try {
			const raw = await getObject(config, obj.key);
			const meta = await parseMeta(raw);
			await env.DB.prepare(
				`INSERT OR IGNORE INTO emails
				 (config_id, s3_key, message_id, from_addr, to_addr, subject, date, size, cached_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
				.bind(
					id,
					obj.key,
					meta.messageId,
					meta.from,
					meta.to,
					meta.subject,
					meta.date ?? obj.lastModified,
					obj.size,
					Date.now(),
				)
				.run();
			added++;
		} catch (err) {
			errors.push(`${obj.key}: ${String(err)}`);
		}
	}

	return json({ total: objects.length, added, errors });
};
