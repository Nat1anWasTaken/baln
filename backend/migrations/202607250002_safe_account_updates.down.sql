DROP FUNCTION IF EXISTS update_account_safely(
    UUID,
    UUID,
    TIMESTAMPTZ,
    TEXT,
    TEXT,
    BOOLEAN,
    TEXT,
    account_type,
    BOOLEAN
);
