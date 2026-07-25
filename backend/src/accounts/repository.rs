use chrono::{DateTime, NaiveDate, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    ApiResult,
    accounts::{Account, AccountType},
};

#[derive(Debug, PartialEq, Eq)]
pub enum DeleteAccountResult {
    Deleted,
    NotFound,
    InUse,
}

pub struct AccountUpdate<'a> {
    pub expected_updated_at: Option<DateTime<Utc>>,
    pub key: Option<&'a str>,
    pub name: Option<&'a str>,
    pub note: Option<Option<&'a str>>,
    pub account_type: Option<AccountType>,
    pub archived: Option<bool>,
}

pub async fn create(
    pool: &PgPool,
    user_id: Uuid,
    key: &str,
    name: &str,
    note: Option<&str>,
    account_type: AccountType,
) -> ApiResult<Account> {
    Ok(sqlx::query_as::<_, Account>(
        r#"
        INSERT INTO accounts (id, user_id, key, name, note, type)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, user_id, key, name, note, type, archived, created_at, updated_at
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(user_id)
    .bind(key)
    .bind(name)
    .bind(note)
    .bind(account_type)
    .fetch_one(pool)
    .await?)
}

pub async fn list(
    pool: &PgPool,
    user_id: Uuid,
    include_archived: bool,
    query: Option<&str>,
) -> ApiResult<Vec<Account>> {
    Ok(sqlx::query_as::<_, Account>(
        r#"
        SELECT id, user_id, key, name, note, type, archived, created_at, updated_at
          FROM accounts
         WHERE user_id = $1
           AND ($2 OR archived = FALSE)
           AND (
                $3::text IS NULL
                OR key ILIKE '%' || $3 || '%'
                OR name ILIKE '%' || $3 || '%'
                OR COALESCE(note, '') ILIKE '%' || $3 || '%'
           )
         ORDER BY type, key
        "#,
    )
    .bind(user_id)
    .bind(include_archived)
    .bind(query)
    .fetch_all(pool)
    .await?)
}

pub async fn get(pool: &PgPool, user_id: Uuid, account_id: Uuid) -> ApiResult<Option<Account>> {
    Ok(sqlx::query_as::<_, Account>(
        r#"
        SELECT id, user_id, key, name, note, type, archived, created_at, updated_at
          FROM accounts
         WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(account_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?)
}

pub async fn update(
    pool: &PgPool,
    user_id: Uuid,
    account_id: Uuid,
    update: AccountUpdate<'_>,
) -> ApiResult<Option<Account>> {
    Ok(sqlx::query_as::<_, Account>(
        r#"
        SELECT id, user_id, key, name, note, type, archived, created_at, updated_at
          FROM update_account_safely($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(user_id)
    .bind(account_id)
    .bind(update.expected_updated_at)
    .bind(update.key)
    .bind(update.name)
    .bind(update.note.is_some())
    .bind(update.note.flatten())
    .bind(update.account_type)
    .bind(update.archived)
    .fetch_optional(pool)
    .await?)
}

pub async fn delete(
    pool: &PgPool,
    user_id: Uuid,
    account_id: Uuid,
) -> ApiResult<DeleteAccountResult> {
    let mut transaction = pool.begin().await?;
    let account_exists = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT id
          FROM accounts
         WHERE id = $1 AND user_id = $2
         FOR UPDATE
        "#,
    )
    .bind(account_id)
    .bind(user_id)
    .fetch_optional(&mut *transaction)
    .await?
    .is_some();

    if !account_exists {
        transaction.rollback().await?;
        return Ok(DeleteAccountResult::NotFound);
    }

    let in_use = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM postings WHERE account_id = $1 AND user_id = $2)",
    )
    .bind(account_id)
    .bind(user_id)
    .fetch_one(&mut *transaction)
    .await?;

    if in_use {
        transaction.rollback().await?;
        return Ok(DeleteAccountResult::InUse);
    }

    sqlx::query("DELETE FROM accounts WHERE id = $1 AND user_id = $2")
        .bind(account_id)
        .bind(user_id)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(DeleteAccountResult::Deleted)
}

pub async fn raw_balance(
    pool: &PgPool,
    user_id: Uuid,
    account_id: Uuid,
    as_of: Option<NaiveDate>,
) -> ApiResult<i64> {
    Ok(sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COALESCE(sum(p.amount_minor), 0)::bigint
          FROM postings p
          JOIN entries e ON e.id = p.entry_id
         WHERE p.user_id = $1
           AND p.account_id = $2
           AND ($3::date IS NULL OR e.date <= $3)
        "#,
    )
    .bind(user_id)
    .bind(account_id)
    .bind(as_of)
    .fetch_one(pool)
    .await?)
}
