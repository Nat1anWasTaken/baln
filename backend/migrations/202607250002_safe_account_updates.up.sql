CREATE FUNCTION update_account_safely(
    p_user_id UUID,
    p_account_id UUID,
    p_expected_updated_at TIMESTAMPTZ,
    p_key TEXT,
    p_name TEXT,
    p_note_is_set BOOLEAN,
    p_note TEXT,
    p_type account_type,
    p_archived BOOLEAN
)
RETURNS SETOF accounts
LANGUAGE SQL
SECURITY INVOKER
AS $$
    UPDATE public.accounts AS account
       SET key = COALESCE(p_key, key),
           name = COALESCE(p_name, name),
           note = CASE WHEN p_note_is_set THEN p_note ELSE note END,
           type = COALESCE(p_type, type),
           archived = COALESCE(p_archived, archived)
     WHERE id = p_account_id
       AND user_id = p_user_id
       AND (
            p_expected_updated_at IS NULL
            OR updated_at = p_expected_updated_at
       )
    RETURNING account.*;
$$;
