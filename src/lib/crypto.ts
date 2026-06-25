// Cryptography helpers built on the runtime's Web Crypto API.
// - AES-GCM for encrypting AWS secret access keys at rest in D1.
// - HMAC-SHA256 for signing the session cookie.

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
	const bin = atob(b64);
	const bytes = new Uint8Array(new ArrayBuffer(bin.length));
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

async function deriveAesKey(keyMaterial: string): Promise<CryptoKey> {
	const hash = await crypto.subtle.digest('SHA-256', enc.encode(keyMaterial));
	return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, [
		'encrypt',
		'decrypt',
	]);
}

export async function encryptSecret(
	plaintext: string,
	keyMaterial: string,
): Promise<{ cipher: string; iv: string }> {
	const key = await deriveAesKey(keyMaterial);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipherBuf = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		enc.encode(plaintext),
	);
	return {
		cipher: bytesToBase64(new Uint8Array(cipherBuf)),
		iv: bytesToBase64(iv),
	};
}

export async function decryptSecret(
	cipherB64: string,
	ivB64: string,
	keyMaterial: string,
): Promise<string> {
	const key = await deriveAesKey(keyMaterial);
	const plainBuf = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: base64ToBytes(ivB64) },
		key,
		base64ToBytes(cipherB64),
	);
	return dec.decode(plainBuf);
}

async function hmac(message: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		enc.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(message));
	return bytesToBase64(new Uint8Array(sigBuf));
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Produces a signed token of the form base64url(payload).signature.
export async function signSession(secret: string): Promise<string> {
	const payload = bytesToBase64(
		enc.encode(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })),
	);
	const sig = await hmac(payload, secret);
	return `${payload}.${sig}`;
}

export async function verifySession(
	token: string | undefined,
	secret: string,
): Promise<boolean> {
	if (!token) return false;
	const [payload, sig] = token.split('.');
	if (!payload || !sig) return false;
	const expected = await hmac(payload, secret);
	if (sig !== expected) return false;
	try {
		const { exp } = JSON.parse(dec.decode(base64ToBytes(payload)));
		return typeof exp === 'number' && exp > Date.now();
	} catch {
		return false;
	}
}
