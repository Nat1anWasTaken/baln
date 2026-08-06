ALTER TABLE oauth_clients
    DROP CONSTRAINT oauth_clients_token_endpoint_auth_method_check;

ALTER TABLE oauth_clients
    DROP COLUMN client_secret_hash,
    DROP COLUMN token_endpoint_auth_method;
