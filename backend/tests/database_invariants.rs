use sqlx::PgPool;
use uuid::Uuid;

async fn seed_user_and_accounts(pool: &PgPool) -> (Uuid, Uuid, Uuid) {
    let user_id = Uuid::now_v7();
    let expense_id = Uuid::now_v7();
    let cash_id = Uuid::now_v7();
    sqlx::query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)")
        .bind(user_id)
        .bind(format!("{user_id}@example.com"))
        .bind("Test User")
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(
        r#"
        INSERT INTO accounts (id, user_id, key, name, type)
        VALUES
            ($1, $3, 'expense.restaurant', '餐飲', 'expense'),
            ($2, $3, 'asset.cash', '現金', 'asset')
        "#,
    )
    .bind(expense_id)
    .bind(cash_id)
    .bind(user_id)
    .execute(pool)
    .await
    .unwrap();
    (user_id, expense_id, cash_id)
}

#[sqlx::test(migrations = "./migrations")]
async fn balanced_entry_commits(pool: PgPool) {
    let (user_id, expense_id, cash_id) = seed_user_and_accounts(&pool).await;
    let entry_id = Uuid::now_v7();
    let mut transaction = pool.begin().await.unwrap();
    sqlx::query(
        "INSERT INTO entries (id, user_id, date, description) VALUES ($1, $2, '2026-07-24', '早餐')",
    )
    .bind(entry_id)
    .bind(user_id)
    .execute(&mut *transaction)
    .await
    .unwrap();
    for (account_id, amount) in [(expense_id, 320_i64), (cash_id, -320_i64)] {
        sqlx::query(
            r#"
            INSERT INTO postings (id, user_id, entry_id, account_id, amount_minor)
            VALUES ($1, $2, $3, $4, $5)
            "#,
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

#[sqlx::test(migrations = "./migrations")]
async fn unbalanced_entry_is_rejected_at_commit(pool: PgPool) {
    let (user_id, expense_id, cash_id) = seed_user_and_accounts(&pool).await;
    let entry_id = Uuid::now_v7();
    let mut transaction = pool.begin().await.unwrap();
    sqlx::query(
        "INSERT INTO entries (id, user_id, date, description) VALUES ($1, $2, '2026-07-24', '錯誤交易')",
    )
    .bind(entry_id)
    .bind(user_id)
    .execute(&mut *transaction)
    .await
    .unwrap();
    for (account_id, amount) in [(expense_id, 320_i64), (cash_id, -300_i64)] {
        sqlx::query(
            r#"
            INSERT INTO postings (id, user_id, entry_id, account_id, amount_minor)
            VALUES ($1, $2, $3, $4, $5)
            "#,
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
    let error = transaction.commit().await.unwrap_err();
    assert_eq!(
        error
            .as_database_error()
            .and_then(|error| error.code())
            .as_deref(),
        Some("23514")
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn tenant_and_archived_account_guards_are_enforced(pool: PgPool) {
    let (first_user, expense_id, _) = seed_user_and_accounts(&pool).await;
    let (second_user, _, second_cash) = seed_user_and_accounts(&pool).await;

    sqlx::query("UPDATE accounts SET archived = TRUE WHERE id = $1")
        .bind(expense_id)
        .execute(&pool)
        .await
        .unwrap();

    let entry_id = Uuid::now_v7();
    let mut archived = pool.begin().await.unwrap();
    sqlx::query(
        "INSERT INTO entries (id, user_id, date, description) VALUES ($1, $2, '2026-07-24', '封存測試')",
    )
    .bind(entry_id)
    .bind(first_user)
    .execute(&mut *archived)
    .await
    .unwrap();
    let error = sqlx::query(
        r#"
        INSERT INTO postings (id, user_id, entry_id, account_id, amount_minor)
        VALUES ($1, $2, $3, $4, 10)
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(first_user)
    .bind(entry_id)
    .bind(expense_id)
    .execute(&mut *archived)
    .await
    .unwrap_err();
    assert_eq!(
        error
            .as_database_error()
            .and_then(|error| error.code())
            .as_deref(),
        Some("23514")
    );
    archived.rollback().await.unwrap();

    let other_entry = Uuid::now_v7();
    let mut cross_tenant = pool.begin().await.unwrap();
    sqlx::query(
        "INSERT INTO entries (id, user_id, date, description) VALUES ($1, $2, '2026-07-24', '隔離測試')",
    )
    .bind(other_entry)
    .bind(second_user)
    .execute(&mut *cross_tenant)
    .await
    .unwrap();
    let error = sqlx::query(
        r#"
        INSERT INTO postings (id, user_id, entry_id, account_id, amount_minor)
        VALUES ($1, $2, $3, $4, -10)
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(first_user)
    .bind(other_entry)
    .bind(second_cash)
    .execute(&mut *cross_tenant)
    .await
    .unwrap_err();
    assert_eq!(
        error
            .as_database_error()
            .and_then(|error| error.code())
            .as_deref(),
        Some("23503")
    );
}
