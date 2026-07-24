CREATE TYPE account_type AS ENUM (
    'asset',
    'liability',
    'income',
    'expense',
    'equity'
);

CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    type account_type NOT NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, user_id),
    UNIQUE (user_id, key),
    CHECK (btrim(name) <> ''),
    CHECK (key ~ '^(asset|liability|income|expense|equity)\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$'),
    CHECK (split_part(key, '.', 1) = type::text)
);

CREATE TABLE entries (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    note TEXT,
    dedup_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, user_id),
    CHECK (btrim(description) <> ''),
    CHECK (dedup_key IS NULL OR btrim(dedup_key) <> '')
);

CREATE UNIQUE INDEX entries_user_dedup_key_uidx
    ON entries (user_id, dedup_key)
    WHERE dedup_key IS NOT NULL;

CREATE TABLE postings (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    entry_id UUID NOT NULL,
    account_id UUID NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor <> 0),
    memo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (entry_id, user_id)
        REFERENCES entries(id, user_id)
        ON DELETE CASCADE,
    FOREIGN KEY (account_id, user_id)
        REFERENCES accounts(id, user_id)
        ON DELETE RESTRICT
);

CREATE INDEX accounts_user_id_idx ON accounts (user_id);
CREATE INDEX entries_user_date_id_idx ON entries (user_id, date DESC, id DESC);
CREATE INDEX postings_entry_id_idx ON postings (entry_id);
CREATE INDEX postings_account_id_idx ON postings (account_id);
CREATE INDEX postings_user_id_idx ON postings (user_id);
