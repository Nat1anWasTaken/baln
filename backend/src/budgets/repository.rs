use chrono::NaiveDate;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    ApiResult,
    budgets::{BudgetAccount, model::BudgetRow},
};

pub(crate) async fn list(
    pool: &PgPool,
    user_id: Uuid,
    overview_only: bool,
) -> ApiResult<Vec<BudgetRow>> {
    Ok(sqlx::query_as::<_, BudgetRow>(
        r#"
        SELECT id, user_id, name, amount_minor, start_date, period_count, period_unit,
               show_on_overview, overview_position, rollover_anchor_date,
               rollover_anchor_minor, created_at, updated_at
          FROM budgets
         WHERE user_id = $1 AND (NOT $2 OR show_on_overview)
         ORDER BY show_on_overview DESC, overview_position ASC NULLS LAST, created_at, id
        "#,
    )
    .bind(user_id)
    .bind(overview_only)
    .fetch_all(pool)
    .await?)
}

pub(crate) async fn get(pool: &PgPool, user_id: Uuid, id: Uuid) -> ApiResult<Option<BudgetRow>> {
    Ok(sqlx::query_as::<_, BudgetRow>(
        r#"
        SELECT id, user_id, name, amount_minor, start_date, period_count, period_unit,
               show_on_overview, overview_position, rollover_anchor_date,
               rollover_anchor_minor, created_at, updated_at
          FROM budgets WHERE user_id = $1 AND id = $2
        "#,
    )
    .bind(user_id)
    .bind(id)
    .fetch_optional(pool)
    .await?)
}

pub(crate) async fn accounts(
    pool: &PgPool,
    user_id: Uuid,
    budget_id: Uuid,
) -> ApiResult<Vec<BudgetAccount>> {
    Ok(sqlx::query_as::<_, BudgetAccount>(
        r#"
        SELECT a.id, a.key, a.name, a.type, a.archived
          FROM budget_accounts ba
          JOIN accounts a ON a.id = ba.account_id
         WHERE ba.user_id = $1 AND ba.budget_id = $2
         ORDER BY a.type, a.key
        "#,
    )
    .bind(user_id)
    .bind(budget_id)
    .fetch_all(pool)
    .await?)
}

pub(crate) async fn spent(
    pool: &PgPool,
    user_id: Uuid,
    budget_id: Uuid,
    date_from: NaiveDate,
    date_to: NaiveDate,
) -> ApiResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COALESCE(sum(entry_expense), 0)::bigint
          FROM (
                SELECT e.id,
                       COALESCE(sum(CASE WHEN a.type = 'expense' THEN p.amount_minor ELSE 0 END), 0)::bigint AS entry_expense
                  FROM entries e
                  JOIN postings p ON p.entry_id = e.id
                  JOIN accounts a ON a.id = p.account_id
                 WHERE e.user_id = $1
                   AND e.date >= $3 AND e.date < $4
                   AND EXISTS (
                       SELECT 1
                         FROM postings matched
                         JOIN budget_accounts ba ON ba.account_id = matched.account_id
                        WHERE matched.entry_id = e.id
                          AND ba.user_id = $1
                          AND ba.budget_id = $2
                   )
                 GROUP BY e.id
               ) matched_entries
        "#,
    ).bind(user_id).bind(budget_id).bind(date_from).bind(date_to).fetch_one(pool).await?)
}

pub(crate) async fn resolve_account_ids(
    transaction: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    keys: &[String],
    existing_budget_id: Option<Uuid>,
) -> ApiResult<Vec<Uuid>> {
    Ok(sqlx::query_scalar::<_, Uuid>(
        r#"SELECT id FROM accounts
            WHERE user_id = $1 AND key = ANY($2)
              AND (NOT archived OR EXISTS (
                    SELECT 1 FROM budget_accounts
                     WHERE budget_id = $3 AND account_id = accounts.id
                  ))
            ORDER BY id"#,
    )
    .bind(user_id)
    .bind(keys)
    .bind(existing_budget_id)
    .fetch_all(&mut **transaction)
    .await?)
}

pub(crate) async fn replace_accounts(
    transaction: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    budget_id: Uuid,
    account_ids: &[Uuid],
) -> ApiResult<()> {
    sqlx::query("DELETE FROM budget_accounts WHERE user_id = $1 AND budget_id = $2")
        .bind(user_id)
        .bind(budget_id)
        .execute(&mut **transaction)
        .await?;
    for account_id in account_ids {
        sqlx::query(
            "INSERT INTO budget_accounts (budget_id, user_id, account_id) VALUES ($1, $2, $3)",
        )
        .bind(budget_id)
        .bind(user_id)
        .bind(account_id)
        .execute(&mut **transaction)
        .await?;
    }
    Ok(())
}

pub(crate) async fn next_overview_position(
    transaction: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
) -> ApiResult<i64> {
    Ok(sqlx::query_scalar("SELECT COALESCE(max(overview_position), -1) + 1 FROM budgets WHERE user_id = $1 AND show_on_overview")
        .bind(user_id).fetch_one(&mut **transaction).await?)
}
