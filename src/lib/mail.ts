// Parse raw RFC822 (MIME) email bytes with postal-mime, which runs in the
// Workers runtime. Two shapes: lightweight metadata for the D1 cache, and the
// full body + attachments for the reading pane.
import PostalMime from 'postal-mime';

export interface EmailMeta {
	messageId: string | null;
	from: string | null;
	to: string | null;
	subject: string | null;
	date: number | null;
}

export interface AttachmentMeta {
	index: number;
	filename: string;
	mimeType: string;
	size: number;
}

export interface FullEmail extends EmailMeta {
	html: string | null;
	text: string | null;
	attachments: AttachmentMeta[];
}

type Addr = { address?: string; name?: string };

function formatAddr(a?: Addr | null): string | null {
	if (!a || !a.address) return a?.name ?? null;
	return a.name ? `${a.name} <${a.address}>` : a.address;
}

function formatAddrs(list?: Addr[] | null): string | null {
	if (!list || list.length === 0) return null;
	return list.map((a) => formatAddr(a)).filter(Boolean).join(', ');
}

function toTimestamp(date?: string | null): number | null {
	if (!date) return null;
	const t = Date.parse(date);
	return Number.isNaN(t) ? null : t;
}

export async function parseMeta(raw: ArrayBuffer): Promise<EmailMeta> {
	const email = await PostalMime.parse(raw);
	return {
		messageId: email.messageId ?? null,
		from: formatAddr(email.from),
		to: formatAddrs(email.to),
		subject: email.subject ?? null,
		date: toTimestamp(email.date),
	};
}

export async function parseFull(raw: ArrayBuffer): Promise<FullEmail> {
	const email = await PostalMime.parse(raw);
	const attachments: AttachmentMeta[] = (email.attachments ?? []).map(
		(att, index) => ({
			index,
			filename: att.filename || `attachment-${index + 1}`,
			mimeType: att.mimeType || 'application/octet-stream',
			size:
				att.content instanceof ArrayBuffer
					? att.content.byteLength
					: typeof att.content === 'string'
						? att.content.length
						: 0,
		}),
	);
	return {
		messageId: email.messageId ?? null,
		from: formatAddr(email.from),
		to: formatAddrs(email.to),
		subject: email.subject ?? null,
		date: toTimestamp(email.date),
		html: email.html ?? null,
		text: email.text ?? null,
		attachments,
	};
}

// Returns the raw attachment bytes/content by index, or null if out of range.
export async function getAttachment(
	raw: ArrayBuffer,
	index: number,
): Promise<{ filename: string; mimeType: string; content: ArrayBuffer } | null> {
	const email = await PostalMime.parse(raw);
	const att = (email.attachments ?? [])[index];
	if (!att) return null;
	let content: ArrayBuffer;
	if (att.content instanceof ArrayBuffer) {
		content = att.content;
	} else {
		// String content (e.g. base64/text) — encode to bytes.
		content = new TextEncoder().encode(String(att.content)).buffer;
	}
	return {
		filename: att.filename || `attachment-${index + 1}`,
		mimeType: att.mimeType || 'application/octet-stream',
		content,
	};
}

// Strip <script> elements as a defense-in-depth measure. The reading pane
// additionally renders this inside a sandboxed iframe (sandbox="", i.e. no
// allow-scripts), which neutralizes inline event handlers and javascript:
// URLs as well. Uses the runtime's built-in HTMLRewriter.
export async function sanitizeHtml(html: string): Promise<string> {
	const rewriter = new HTMLRewriter().on('script', {
		element(el) {
			el.remove();
		},
	});
	const res = rewriter.transform(new Response(html));
	return res.text();
}
