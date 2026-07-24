use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    ApiResult,
    accounts::AccountType,
    reports::{PeriodSummary, ReportAccountTotal, model::ReportRow},
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
}
