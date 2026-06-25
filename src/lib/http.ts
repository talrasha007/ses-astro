export function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
}

export function badRequest(message: string): Response {
	return json({ error: message }, 400);
}

export function notFound(message = 'not found'): Response {
	return json({ error: message }, 404);
}
