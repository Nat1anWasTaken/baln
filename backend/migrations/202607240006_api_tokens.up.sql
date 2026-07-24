CREATE TABLE api_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_hash BYTEA NOT NULL UNIQUE,
    token_hint TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX api_tokens_user_id_created_at_idx
    ON api_tokens (user_id, created_at DESC);
