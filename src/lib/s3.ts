// Minimal S3 access using aws4fetch (SigV4 signing over native fetch),
// which runs in the Cloudflare Workers runtime. Only the read operations we
// need: list objects under a prefix and fetch a single object.
import { AwsClient } from 'aws4fetch';
import type { ResolvedConfig, S3Object } from './types';

function clientFor(config: ResolvedConfig): AwsClient {
	return new AwsClient({
		accessKeyId: config.accessKeyId,
		secretAccessKey: config.secretAccessKey,
		region: config.region,
		service: 's3',
	});
}

function host(config: ResolvedConfig): string {
	return `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
}

// Encode an object key for use in a URL path without escaping the slashes.
function encodeKey(key: string): string {
	return key.split('/').map(encodeURIComponent).join('/');
}

function tag(xml: string, name: string): string | null {
	const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
	return m ? m[1] : null;
}

// List every object under the config's prefix, following continuation tokens.
export async function listObjects(config: ResolvedConfig): Promise<S3Object[]> {
	const client = clientFor(config);
	const objects: S3Object[] = [];
	let token: string | undefined;

	do {
		const url = new URL(host(config) + '/');
		url.searchParams.set('list-type', '2');
		if (config.prefix) url.searchParams.set('prefix', config.prefix);
		if (token) url.searchParams.set('continuation-token', token);

		const res = await client.fetch(url.toString());
		if (!res.ok) {
			throw new Error(`S3 list failed (${res.status}): ${await res.text()}`);
		}
		const xml = await res.text();

		for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
			const block = m[1];
			const key = tag(block, 'Key');
			if (!key) continue;
			// Skip "folder" placeholder keys.
			if (key.endsWith('/')) continue;
			const lastMod = tag(block, 'LastModified');
			objects.push({
				key,
				size: Number(tag(block, 'Size') ?? 0),
				lastModified: lastMod ? Date.parse(lastMod) : null,
			});
		}

		const truncated = tag(xml, 'IsTruncated') === 'true';
		token = truncated ? tag(xml, 'NextContinuationToken') ?? undefined : undefined;
	} while (token);

	return objects;
}

// Fetch the raw bytes of a single object.
export async function getObject(
	config: ResolvedConfig,
	key: string,
): Promise<ArrayBuffer> {
	const client = clientFor(config);
	const res = await client.fetch(`${host(config)}/${encodeKey(key)}`);
	if (!res.ok) {
		throw new Error(`S3 get failed (${res.status}): ${await res.text()}`);
	}
	return res.arrayBuffer();
}
