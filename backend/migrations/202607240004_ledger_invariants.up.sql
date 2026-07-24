CREATE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER accounts_set_updated_at
BEFORE UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER entries_set_updated_at
BEFORE UPDATE ON entries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION enforce_posting_account_is_active()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    account_is_archived BOOLEAN;
BEGIN
    SELECT archived
      INTO account_is_archived
      FROM accounts
     WHERE id = NEW.account_id
       AND user_id = NEW.user_id
     FOR SHARE;

    IF account_is_archived IS NULL THEN
        RETURN NEW;
    END IF;

    IF account_is_archived
       AND NOT EXISTS (
           SELECT 1
             FROM postings
            WHERE entry_id = NEW.entry_id
              AND account_id = NEW.account_id
       )
    THEN
        RAISE EXCEPTION 'cannot add a posting to archived account %', NEW.account_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER postings_active_account
BEFORE INSERT OR UPDATE OF account_id, user_id, entry_id ON postings
FOR EACH ROW EXECUTE FUNCTION enforce_posting_account_is_active();

CREATE FUNCTION assert_entry_balanced(target_entry_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    posting_count BIGINT;
    posting_sum NUMERIC;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM entries WHERE id = target_entry_id) THEN
        RETURN;
    END IF;

    SELECT count(*), COALESCE(sum(amount_minor::numeric), 0)
      INTO posting_count, posting_sum
      FROM postings
     WHERE entry_id = target_entry_id;

    IF posting_count < 2 THEN
        RAISE EXCEPTION 'entry % must have at least two postings', target_entry_id
            USING ERRCODE = '23514';
    END IF;

    IF posting_sum <> 0 THEN
        RAISE EXCEPTION 'entry % is not balanced (sum=%)', target_entry_id, posting_sum
            USING ERRCODE = '23514';
    END IF;
END;
$$;

CREATE FUNCTION check_entry_balance_from_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM assert_entry_balanced(NEW.id);
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER entries_are_balanced
AFTER INSERT ON entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_entry_balance_from_entry();

CREATE FUNCTION check_entry_balance_from_posting()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM assert_entry_balanced(OLD.entry_id);
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM assert_entry_balanced(OLD.entry_id);
        IF NEW.entry_id <> OLD.entry_id THEN
            PERFORM assert_entry_balanced(NEW.entry_id);
        END IF;
    ELSE
        PERFORM assert_entry_balanced(NEW.entry_id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER postings_keep_entries_balanced
AFTER INSERT OR UPDATE OR DELETE ON postings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_entry_balance_from_posting();
