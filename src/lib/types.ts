// Shared row/domain types.

export interface ConfigRow {
	id: number;
	alias: string;
	region: string;
	bucket: string;
	prefix: string;
	access_key_id: string;
	secret_access_key_enc: string;
	secret_iv: string;
	created_at: number;
}

export interface EmailRow {
	id: number;
	config_id: number;
	s3_key: string;
	message_id: string | null;
	from_addr: string | null;
	to_addr: string | null;
	subject: string | null;
	date: number | null;
	size: number | null;
	cached_at: number;
}

// A config with the secret access key already decrypted, ready to sign requests.
export interface ResolvedConfig {
	region: string;
	bucket: string;
	prefix: string;
	accessKeyId: string;
	secretAccessKey: string;
}

export interface S3Object {
	key: string;
	size: number;
	lastModified: number | null;
}
