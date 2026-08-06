ALTER TABLE oauth_clients
    ADD COLUMN token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN client_secret_hash BYTEA;

ALTER TABLE oauth_clients
    ADD CONSTRAINT oauth_clients_token_endpoint_auth_method_check
    CHECK (
        (token_endpoint_auth_method = 'none' AND client_secret_hash IS NULL)
        OR (
            token_endpoint_auth_method IN ('client_secret_basic', 'client_secret_post')
            AND client_secret_hash IS NOT NULL
        )
    );
