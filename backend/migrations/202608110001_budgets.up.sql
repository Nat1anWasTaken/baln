CREATE TYPE budget_period_unit AS ENUM ('day', 'week', 'month', 'year');

CREATE TABLE budgets (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount_minor BIGINT NOT NULL,
    start_date DATE NOT NULL,
    period_count INTEGER NOT NULL,
    period_unit budget_period_unit NOT NULL,
    show_on_overview BOOLEAN NOT NULL DEFAULT FALSE,
    overview_position BIGINT,
    rollover_anchor_date DATE NOT NULL,
    rollover_anchor_minor BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, user_id),
    CHECK (btrim(name) <> ''),
    CHECK (amount_minor > 0),
    CHECK (period_count > 0),
    CHECK (
        (show_on_overview AND overview_position IS NOT NULL AND overview_position >= 0)
        OR (NOT show_on_overview AND overview_position IS NULL)
    )
);

CREATE TABLE budget_accounts (
    budget_id UUID NOT NULL,
    user_id UUID NOT NULL,
    account_id UUID NOT NULL,
    PRIMARY KEY (budget_id, account_id),
    FOREIGN KEY (budget_id, user_id)
        REFERENCES budgets(id, user_id)
        ON DELETE CASCADE,
    FOREIGN KEY (account_id, user_id)
        REFERENCES accounts(id, user_id)
        ON DELETE RESTRICT
);

CREATE INDEX budgets_user_id_idx ON budgets (user_id);
CREATE INDEX budgets_user_overview_idx
    ON budgets (user_id, overview_position)
    WHERE show_on_overview;
CREATE INDEX budget_accounts_account_id_idx ON budget_accounts (account_id);

