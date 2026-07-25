DROP INDEX IF EXISTS accounts_note_trgm_idx;

ALTER TABLE accounts
    DROP CONSTRAINT IF EXISTS accounts_note_length,
    DROP COLUMN IF EXISTS note;
