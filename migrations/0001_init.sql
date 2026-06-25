-- S3 access configurations. The AWS secret access key is stored encrypted
-- (AES-GCM); secret_iv holds the per-record initialization vector.
CREATE TABLE configs (
	id                    INTEGER PRIMARY KEY AUTOINCREMENT,
	alias                 TEXT    NOT NULL,
	region                TEXT    NOT NULL,
	bucket                TEXT    NOT NULL,
	prefix                TEXT    NOT NULL DEFAULT '',
	access_key_id         TEXT    NOT NULL,
	secret_access_key_enc TEXT    NOT NULL,
	secret_iv             TEXT    NOT NULL,
	created_at            INTEGER NOT NULL
);

-- Cached email metadata, parsed once from the raw MIME object in S3.
CREATE TABLE emails (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	config_id  INTEGER NOT NULL REFERENCES configs(id) ON DELETE CASCADE,
	s3_key     TEXT    NOT NULL,
	message_id TEXT,
	from_addr  TEXT,
	to_addr    TEXT,
	subject    TEXT,
	date       INTEGER,
	size       INTEGER,
	cached_at  INTEGER NOT NULL,
	UNIQUE (config_id, s3_key)
);

CREATE INDEX idx_emails_config ON emails(config_id, date DESC);
