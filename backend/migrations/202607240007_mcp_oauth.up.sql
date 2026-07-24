CREATE TABLE oauth_clients (
    id UUID PRIMARY KEY,
    client_id TEXT NOT NULL UNIQUE,
    client_name TEXT NOT NULL,
    redirect_uris TEXT[] NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (btrim(client_id) <> ''),
    CHECK (btrim(client_name) <> ''),
    CHECK (cardinality(redirect_uris) > 0)
);

CREATE TABLE oauth_authorization_requests (
    id UUID PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    redirect_uri TEXT NOT NULL,
    state TEXT,
    code_challenge TEXT NOT NULL,
    resource TEXT NOT NULL,
    scopes TEXT[] NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE oauth_grants (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    resource TEXT NOT NULL,
    scopes TEXT[] NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE oauth_authorization_codes (
    code_hash BYTEA PRIMARY KEY,
    grant_id UUID NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE oauth_access_tokens (
    id UUID PRIMARY KEY,
    grant_id UUID NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
    token_hash BYTEA NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE oauth_refresh_tokens (
    id UUID PRIMARY KEY,
    family_id UUID NOT NULL,
    grant_id UUID NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
    token_hash BYTEA NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by UUID REFERENCES oauth_refresh_tokens(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX oauth_authorization_requests_expires_at_idx
    ON oauth_authorization_requests (expires_at);
CREATE INDEX oauth_grants_user_id_idx ON oauth_grants (user_id);
CREATE INDEX oauth_authorization_codes_expires_at_idx
    ON oauth_authorization_codes (expires_at);
CREATE INDEX oauth_access_tokens_grant_id_idx ON oauth_access_tokens (grant_id);
CREATE INDEX oauth_access_tokens_expires_at_idx ON oauth_access_tokens (expires_at);
CREATE INDEX oauth_refresh_tokens_grant_id_idx ON oauth_refresh_tokens (grant_id);
CREATE INDEX oauth_refresh_tokens_family_id_idx ON oauth_refresh_tokens (family_id);
