CREATE TYPE budget_rollover_mode AS ENUM ('accumulate', 'surplus_only', 'reset');

ALTER TABLE budgets
    ADD COLUMN rollover_mode budget_rollover_mode NOT NULL DEFAULT 'accumulate';
