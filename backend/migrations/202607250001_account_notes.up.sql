ALTER TABLE accounts
    ADD COLUMN note TEXT,
    ADD CONSTRAINT accounts_note_length
        CHECK (note IS NULL OR char_length(note) <= 2000);

CREATE INDEX accounts_note_trgm_idx
    ON accounts USING GIN ((COALESCE(note, '')) gin_trgm_ops);
