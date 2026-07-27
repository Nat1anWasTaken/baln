use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    ApiResult,
    accounts::AccountType,
    reports::{
        FinancialPosition, PeriodSummary, ReportAccountTotal, ReportGranularity, ReportTrendPoint,
        model::ReportRow,
    },
};

pub async fn summary(
    pool: &PgPool,
    user_id: Uuid,
    date_from: NaiveDate,
    date_to: NaiveDate,
) -> ApiResult<PeriodSummary> {
    let rows = sqlx::query_as::<_, ReportRow>(
        r#"
        SELECT a.id AS account_id, a.key AS account_key, a.name AS account_name,
               a.type AS account_type, sum(p.amount_minor)::bigint AS ledger_total_minor
          FROM postings p
          JOIN entries e ON e.id = p.entry_id
          JOIN accounts a ON a.id = p.account_id
         WHERE p.user_id = $1
           AND e.date >= $2
           AND e.date < $3
           AND a.type IN ('income', 'expense')
         GROUP BY a.id, a.key, a.name, a.type
         ORDER BY a.type, a.key
        "#,
    )
    .bind(user_id)
    .bind(date_from)
    .bind(date_to)
    .fetch_all(pool)
    .await?;

    let mut income_accounts = Vec::new();
    let mut expense_accounts = Vec::new();
    for row in rows {
        let total_minor = row.account_type.normalize_balance(row.ledger_total_minor);
        let item = ReportAccountTotal {
            account_id: row.account_id,
            account_key: row.account_key,
            account_name: row.account_name,
            account_type: row.account_type,
            total_minor,
        };
        match row.account_type {
            AccountType::Income => income_accounts.push(item),
            AccountType::Expense => expense_accounts.push(item),
            _ => unreachable!("query only selects income and expense"),
        }
    }
    let income_minor = income_accounts.iter().map(|item| item.total_minor).sum();
    let expense_minor = expense_accounts.iter().map(|item| item.total_minor).sum();
    Ok(PeriodSummary {
        date_from,
        date_to,
        income_minor,
        expense_minor,
        net_minor: income_minor - expense_minor,
        income_accounts,
        expense_accounts,
    })
}

pub async fn trend(
    pool: &PgPool,
    user_id: Uuid,
    date_from: NaiveDate,
    date_to: NaiveDate,
    granularity: ReportGranularity,
) -> ApiResult<Vec<ReportTrendPoint>> {
    Ok(sqlx::query_as::<_, ReportTrendPoint>(
        r#"
        WITH requested AS (
            SELECT date_trunc($4, $2::timestamp)::date AS first_bucket,
                   date_trunc($4, ($3::date - 1)::timestamp)::date AS last_bucket
        ),
        buckets AS (
            SELECT generate_series(
                       first_bucket::timestamp,
                       last_bucket::timestamp,
                       CASE $4
                           WHEN 'day' THEN interval '1 day'
                           WHEN 'week' THEN interval '1 week'
                           ELSE interval '1 month'
                       END
                   )::date AS bucket_start
              FROM requested
        ),
        totals AS (
            SELECT date_trunc($4, e.date::timestamp)::date AS bucket_start,
                   COALESCE(sum(
                       CASE WHEN a.type = 'income' THEN -p.amount_minor ELSE 0 END
                   ), 0)::bigint AS income_minor,
                   COALESCE(sum(
                       CASE WHEN a.type = 'expense' THEN p.amount_minor ELSE 0 END
                   ), 0)::bigint AS expense_minor
              FROM postings p
              JOIN entries e ON e.id = p.entry_id
              JOIN accounts a ON a.id = p.account_id
             WHERE p.user_id = $1
               AND e.date >= $2
               AND e.date < $3
               AND a.type IN ('income', 'expense')
             GROUP BY 1
        )
        SELECT greatest(b.bucket_start, $2::date) AS date_from,
               least(
                   CASE $4
                       WHEN 'day' THEN b.bucket_start + 1
                       WHEN 'week' THEN b.bucket_start + 7
                       ELSE (b.bucket_start + interval '1 month')::date
                   END,
                   $3::date
               ) AS date_to,
               COALESCE(t.income_minor, 0)::bigint AS income_minor,
               COALESCE(t.expense_minor, 0)::bigint AS expense_minor,
               (
                   COALESCE(t.income_minor, 0) - COALESCE(t.expense_minor, 0)
               )::bigint AS net_minor
          FROM buckets b
          LEFT JOIN totals t USING (bucket_start)
         ORDER BY b.bucket_start
        "#,
    )
    .bind(user_id)
    .bind(date_from)
    .bind(date_to)
    .bind(granularity.as_str())
    .fetch_all(pool)
    .await?)
}

pub async fn position(
    pool: &PgPool,
    user_id: Uuid,
    as_of: NaiveDate,
) -> ApiResult<FinancialPosition> {
    Ok(sqlx::query_as::<_, FinancialPosition>(
        r#"
        SELECT $2::date AS as_of,
               COALESCE(sum(
                   CASE WHEN a.type = 'asset' THEN p.amount_minor ELSE 0 END
               ), 0)::bigint AS asset_minor,
               COALESCE(sum(
                   CASE WHEN a.type = 'liability' THEN -p.amount_minor ELSE 0 END
               ), 0)::bigint AS liability_minor,
               COALESCE(sum(
                   CASE
                       WHEN a.type = 'asset' THEN p.amount_minor
                       WHEN a.type = 'liability' THEN p.amount_minor
                       ELSE 0
                   END
               ), 0)::bigint AS net_worth_minor
          FROM postings p
          JOIN entries e ON e.id = p.entry_id
          JOIN accounts a ON a.id = p.account_id
         WHERE p.user_id = $1
           AND e.date <= $2
           AND a.type IN ('asset', 'liability')
        "#,
    )
    .bind(user_id)
    .bind(as_of)
    .fetch_one(pool)
    .await?)
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;
    use sqlx::PgPool;
    use uuid::Uuid;

    use super::*;

    #[sqlx::test(migrations = "./migrations")]
    async fn summary_normalizes_income_and_expense_signs(pool: PgPool) {
        let user_id = Uuid::now_v7();
        sqlx::query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Report User')")
            .bind(user_id)
            .bind(format!("{user_id}@example.com"))
            .execute(&pool)
            .await
            .unwrap();
        let bank_id = Uuid::now_v7();
        let income_id = Uuid::now_v7();
        let expense_id = Uuid::now_v7();
        sqlx::query(
            r#"
            INSERT INTO accounts (id, user_id, key, name, type)
            VALUES
                ($1, $4, 'asset.bank.test', '銀行', 'asset'),
                ($2, $4, 'income.salary', '薪資', 'income'),
                ($3, $4, 'expense.restaurant', '餐飲', 'expense')
            "#,
        )
        .bind(bank_id)
        .bind(income_id)
        .bind(expense_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();

        for (description, debit_account, credit_account, amount) in [
            ("薪資", bank_id, income_id, 50_000_i64),
            ("晚餐", expense_id, bank_id, 500_i64),
        ] {
            let entry_id = Uuid::now_v7();
            let mut transaction = pool.begin().await.unwrap();
            sqlx::query(
                "INSERT INTO entries (id, user_id, date, description) VALUES ($1, $2, '2026-07-24', $3)",
            )
            .bind(entry_id)
            .bind(user_id)
            .bind(description)
            .execute(&mut *transaction)
            .await
            .unwrap();
            for (account_id, posting_amount) in [(debit_account, amount), (credit_account, -amount)]
            {
                sqlx::query(
                    r#"
                    INSERT INTO postings
                                (id, user_id, entry_id, account_id, amount_minor)
                         VALUES ($1, $2, $3, $4, $5)
                    "#,
                )
                .bind(Uuid::now_v7())
                .bind(user_id)
                .bind(entry_id)
                .bind(account_id)
                .bind(posting_amount)
                .execute(&mut *transaction)
                .await
                .unwrap();
            }
            transaction.commit().await.unwrap();
        }

        let report = summary(
            &pool,
            user_id,
            NaiveDate::from_ymd_opt(2026, 7, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 8, 1).unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(report.income_minor, 50_000);
        assert_eq!(report.expense_minor, 500);
        assert_eq!(report.net_minor, 49_500);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn trend_and_position_respect_ledger_semantics(pool: PgPool) {
        let user_id = Uuid::now_v7();
        sqlx::query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Analysis User')")
            .bind(user_id)
            .bind(format!("{user_id}@example.com"))
            .execute(&pool)
            .await
            .unwrap();

        let bank_id = Uuid::now_v7();
        let savings_id = Uuid::now_v7();
        let card_id = Uuid::now_v7();
        let income_id = Uuid::now_v7();
        let expense_id = Uuid::now_v7();
        let equity_id = Uuid::now_v7();
        sqlx::query(
            r#"
            INSERT INTO accounts (id, user_id, key, name, type, archived)
            VALUES
                ($1, $7, 'asset.bank', '銀行', 'asset', FALSE),
                ($2, $7, 'asset.savings', '存款', 'asset', FALSE),
                ($3, $7, 'liability.card', '信用卡', 'liability', FALSE),
                ($4, $7, 'income.salary', '薪資', 'income', FALSE),
                ($5, $7, 'expense.food', '餐飲', 'expense', FALSE),
                ($6, $7, 'equity.opening', '期初', 'equity', FALSE)
            "#,
        )
        .bind(bank_id)
        .bind(savings_id)
        .bind(card_id)
        .bind(income_id)
        .bind(expense_id)
        .bind(equity_id)
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();

        for (date, description, postings) in [
            (
                "2026-01-01",
                "期初餘額",
                vec![(bank_id, 10_000_i64), (equity_id, -10_000_i64)],
            ),
            (
                "2026-01-03",
                "薪資",
                vec![(bank_id, 5_000_i64), (income_id, -5_000_i64)],
            ),
            (
                "2026-01-05",
                "餐費",
                vec![(expense_id, 2_000_i64), (card_id, -2_000_i64)],
            ),
            (
                "2026-01-06",
                "轉存",
                vec![(savings_id, 1_000_i64), (bank_id, -1_000_i64)],
            ),
            (
                "2026-02-01",
                "繳卡費",
                vec![(card_id, 2_000_i64), (bank_id, -2_000_i64)],
            ),
        ] {
            let entry_id = Uuid::now_v7();
            let mut transaction = pool.begin().await.unwrap();
            sqlx::query(
                "INSERT INTO entries (id, user_id, date, description) VALUES ($1, $2, $3, $4)",
            )
            .bind(entry_id)
            .bind(user_id)
            .bind(NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap())
            .bind(description)
            .execute(&mut *transaction)
            .await
            .unwrap();
            for (account_id, amount) in postings {
                sqlx::query(
                    "INSERT INTO postings (id, user_id, entry_id, account_id, amount_minor) VALUES ($1, $2, $3, $4, $5)",
                )
                .bind(Uuid::now_v7())
                .bind(user_id)
                .bind(entry_id)
                .bind(account_id)
                .bind(amount)
                .execute(&mut *transaction)
                .await
                .unwrap();
            }
            transaction.commit().await.unwrap();
        }
        sqlx::query("UPDATE accounts SET archived = TRUE WHERE id = $1")
            .bind(savings_id)
            .execute(&pool)
            .await
            .unwrap();

        let points = trend(
            &pool,
            user_id,
            NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 3, 1).unwrap(),
            ReportGranularity::Month,
        )
        .await
        .unwrap();
        assert_eq!(points.len(), 2);
        assert_eq!(points[0].income_minor, 5_000);
        assert_eq!(points[0].expense_minor, 2_000);
        assert_eq!(points[0].net_minor, 3_000);
        assert_eq!(points[1].income_minor, 0);
        assert_eq!(points[1].expense_minor, 0);

        let snapshot = position(
            &pool,
            user_id,
            NaiveDate::from_ymd_opt(2026, 1, 31).unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(snapshot.asset_minor, 15_000);
        assert_eq!(snapshot.liability_minor, 2_000);
        assert_eq!(snapshot.net_worth_minor, 13_000);
    }
}
