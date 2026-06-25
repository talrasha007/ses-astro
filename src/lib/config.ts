import { decryptSecret } from './crypto';
import type { ConfigRow, ResolvedConfig } from './types';

// Decrypt a config row's secret access key for use in signed S3 requests.
// This only ever runs server-side; the secret is never sent to the browser.
export async function resolveConfig(
	row: ConfigRow,
	encryptionKey: string,
): Promise<ResolvedConfig> {
	const secretAccessKey = await decryptSecret(
		row.secret_access_key_enc,
		row.secret_iv,
		encryptionKey,
	);
	return {
		region: row.region,
		bucket: row.bucket,
		prefix: row.prefix,
		accessKeyId: row.access_key_id,
		secretAccessKey,
	};
}
