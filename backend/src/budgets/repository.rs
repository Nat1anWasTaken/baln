use chrono::NaiveDate;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    ApiResult,
    budgets::{BudgetAccount, model::BudgetRow},
};

const BUDGET_ENTRY_MEMBERSHIP_SQL: &str = r#"
NOT e.excluded_from_budgets
AND EXISTS (
    SELECT 1
      FROM postings budget_posting
      JOIN budget_accounts ba ON ba.account_id = budget_posting.account_id
     WHERE budget_posting.entry_id = e.id
       AND budget_posting.user_id = e.user_id
       AND ba.user_id = e.user_id
       AND ba.budget_id = {budget_id}
)"#;

/// The canonical predicate for deciding whether an entry belongs to a budget.
///
/// Callers provide a trusted SQL bind placeholder (for example, `$2`). Keeping
/// the predicate here ensures budget totals and entry filtering cannot drift.
pub(crate) fn budget_entry_membership_sql(budget_id: &'static str) -> String {
    BUDGET_ENTRY_MEMBERSHIP_SQL.replace("{budget_id}", budget_id)
}

fn budget_entry_expenses_cte() -> String {
    format!(
        r#"budget_entry_expenses AS (
            SELECT e.date,
                   COALESCE(sum(CASE WHEN a.type = 'expense' THEN p.amount_minor ELSE 0 END), 0)::bigint AS spent_minor
              FROM entries e
              JOIN postings p ON p.entry_id = e.id AND p.user_id = e.user_id
              JOIN accounts a ON a.id = p.account_id
             WHERE e.user_id = $1
               AND {membership}
             GROUP BY e.id, e.date
        )"#,
        membership = budget_entry_membership_sql("$2"),
    )
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct BudgetDayRow {
    pub date: NaiveDate,
    pub spent_minor: i64,
    pub cumulative_spent_minor: i64,
    pub entry_count: i64,
    pub is_future: bool,
}

pub(crate) async fn list(
    pool: &PgPool,
    user_id: Uuid,
    overview_only: bool,
) -> ApiResult<Vec<BudgetRow>> {
    Ok(sqlx::query_as::<_, BudgetRow>(
        r#"
        SELECT id, user_id, name, amount_minor, start_date, period_count, period_unit, rollover_mode,
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
        SELECT id, user_id, name, amount_minor, start_date, period_count, period_unit, rollover_mode,
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
    let sql = format!(
        "WITH {} SELECT COALESCE(sum(spent_minor), 0)::bigint FROM budget_entry_expenses WHERE date >= $3 AND date < $4",
        budget_entry_expenses_cte(),
    );
    Ok(sqlx::query_scalar::<_, i64>(&sql)
        .bind(user_id)
        .bind(budget_id)
        .bind(date_from)
        .bind(date_to)
        .fetch_one(pool)
        .await?)
}

/// Returns one row for every calendar date in a budget period, including dates
/// without matching entries.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn days(
    pool: &PgPool,
    user_id: Uuid,
    budget_id: Uuid,
    date_from: NaiveDate,
    date_to: NaiveDate,
    cursor_date: Option<NaiveDate>,
    limit: i64,
    as_of: NaiveDate,
    upcoming: bool,
) -> ApiResult<Vec<BudgetDayRow>> {
    let sql = format!(
        r#"
        WITH {budget_entry_expenses}, daily_totals AS (
            SELECT date,
                   COALESCE(sum(spent_minor), 0)::bigint AS spent_minor,
                   count(*)::bigint AS entry_count
              FROM budget_entry_expenses
             WHERE date >= $3 AND date < $4
             GROUP BY date
        ), calendar AS (
            SELECT generate_series($3::date, ($4::date - 1), interval '1 day')::date AS date
        ), calendar_values AS (
            SELECT c.date,
                   CASE WHEN $8 THEN 0 ELSE COALESCE(t.spent_minor, 0) END::bigint AS spent_minor,
                   CASE WHEN $8 THEN 0 ELSE COALESCE(t.entry_count, 0) END::bigint AS entry_count
              FROM calendar c
              LEFT JOIN daily_totals t USING (date)
        ), with_cumulative_spend AS (
            SELECT date,
                   spent_minor,
                   COALESCE(sum(spent_minor) OVER (ORDER BY date), 0)::bigint AS cumulative_spent_minor,
                   entry_count,
                   (date > $7)::boolean AS is_future
              FROM calendar_values
        )
        SELECT date, spent_minor, cumulative_spent_minor, entry_count, is_future
          FROM with_cumulative_spend
         WHERE ($5::date IS NULL OR date < $5)
         ORDER BY date DESC
         LIMIT $6
        "#,
        budget_entry_expenses = budget_entry_expenses_cte(),
    );
    Ok(sqlx::query_as::<_, BudgetDayRow>(&sql)
        .bind(user_id)
        .bind(budget_id)
        .bind(date_from)
        .bind(date_to)
        .bind(cursor_date)
        .bind(limit)
        .bind(as_of)
        .bind(upcoming)
        .fetch_all(pool)
        .await?)
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct BudgetTrendRow {
    pub date_from: NaiveDate,
    pub date_to: NaiveDate,
    pub spent_minor: i64,
}

/// Aggregates matching signed expense postings into caller-provided, adjacent
/// bucket ranges. Ranges are generated from budget-period boundaries by the
/// service, so no bucket can cross the selected period.
pub(crate) async fn trend(
    pool: &PgPool,
    user_id: Uuid,
    budget_id: Uuid,
    ranges: &[(NaiveDate, NaiveDate)],
    upcoming: bool,
) -> ApiResult<Vec<BudgetTrendRow>> {
    if ranges.is_empty() {
        return Ok(Vec::new());
    }
    let date_from = ranges.iter().map(|(from, _)| *from).collect::<Vec<_>>();
    let date_to = ranges.iter().map(|(_, to)| *to).collect::<Vec<_>>();
    let sql = format!(
        r#"
        WITH {budget_entry_expenses}, ranges AS (
            SELECT date_from, date_to
              FROM unnest($3::date[], $4::date[]) AS r(date_from, date_to)
        ), totals AS (
            SELECT r.date_from,
                   r.date_to,
                   COALESCE(sum(e.spent_minor), 0)::bigint AS spent_minor
              FROM ranges r
              JOIN budget_entry_expenses e ON e.date >= r.date_from
                            AND e.date < r.date_to
             GROUP BY r.date_from, r.date_to
        )
        SELECT r.date_from,
               r.date_to,
               CASE WHEN $5 THEN 0 ELSE COALESCE(t.spent_minor, 0) END::bigint AS spent_minor
          FROM ranges r
          LEFT JOIN totals t USING (date_from, date_to)
         ORDER BY r.date_from
        "#,
        budget_entry_expenses = budget_entry_expenses_cte(),
    );
    Ok(sqlx::query_as::<_, BudgetTrendRow>(&sql)
        .bind(user_id)
        .bind(budget_id)
        .bind(&date_from)
        .bind(&date_to)
        .bind(upcoming)
        .fetch_all(pool)
        .await?)
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
