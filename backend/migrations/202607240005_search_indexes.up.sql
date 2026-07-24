CREATE INDEX entries_description_trgm_idx
    ON entries USING GIN (description gin_trgm_ops);
CREATE INDEX entries_note_trgm_idx
    ON entries USING GIN ((COALESCE(note, '')) gin_trgm_ops);
CREATE INDEX accounts_name_trgm_idx
    ON accounts USING GIN (name gin_trgm_ops);
CREATE INDEX postings_memo_trgm_idx
    ON postings USING GIN ((COALESCE(memo, '')) gin_trgm_ops);
