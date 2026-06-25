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

function attachmentBytes(content: unknown): ArrayBuffer {
	if (content instanceof ArrayBuffer) return content;
	return new TextEncoder().encode(String(content)).buffer;
}

function bytesToBase64(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let bin = '';
	const chunk = 0x8000; // encode in chunks to avoid call-stack limits
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(bin);
}

export async function parseFull(raw: ArrayBuffer): Promise<FullEmail> {
	const email = await PostalMime.parse(raw);
	const allAttachments = email.attachments ?? [];

	// Inline images are referenced from the HTML body as `cid:<Content-ID>`.
	// A sandboxed iframe can't resolve those, so rewrite each reference into a
	// self-contained data: URI, and drop that attachment from the download list.
	let html = email.html ?? null;
	const inlined = new Set<number>();
	if (html) {
		allAttachments.forEach((att, index) => {
			if (!att.contentId) return;
			const cid = att.contentId.replace(/^<|>$/g, '');
			const token = `cid:${cid}`;
			if (!html!.includes(token)) return;
			const mime = att.mimeType || 'application/octet-stream';
			const dataUri = `data:${mime};base64,${bytesToBase64(attachmentBytes(att.content))}`;
			html = html!.split(token).join(dataUri);
			inlined.add(index);
		});
	}

	const attachments: AttachmentMeta[] = [];
	allAttachments.forEach((att, index) => {
		if (inlined.has(index)) return; // now rendered inline in the body
		attachments.push({
			index,
			filename: att.filename || `attachment-${index + 1}`,
			mimeType: att.mimeType || 'application/octet-stream',
			size:
				att.content instanceof ArrayBuffer
					? att.content.byteLength
					: typeof att.content === 'string'
						? att.content.length
						: 0,
		});
	});

	return {
		messageId: email.messageId ?? null,
		from: formatAddr(email.from),
		to: formatAddrs(email.to),
		subject: email.subject ?? null,
		date: toTimestamp(email.date),
		html,
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
	return {
		filename: att.filename || `attachment-${index + 1}`,
		mimeType: att.mimeType || 'application/octet-stream',
		content: attachmentBytes(att.content),
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
