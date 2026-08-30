use std::collections::HashMap;

use chrono::NaiveDate;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    ApiResult,
    accounts::Account,
    entries::{
        AccountSummary, EntryResponse, PostingResponse,
        model::{EntryPostingRow, EntryRow, PostingRow},
    },
};

pub async fn get(pool: &PgPool, user_id: Uuid, entry_id: Uuid) -> ApiResult<Option<EntryResponse>> {
    let row = sqlx::query_as::<_, EntryRow>(
        r#"
        SELECT id, user_id, date, description, note, dedup_key, excluded_from_budgets,
               created_at, updated_at
          FROM entries
         WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(entry_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    match row {
        Some(row) => Ok(Some(hydrate(pool, row).await?)),
        None => Ok(None),
    }
}

pub(crate) async fn get_by_dedup_in_transaction(
    transaction: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    dedup_key: &str,
) -> ApiResult<Option<EntryResponse>> {
    let row = sqlx::query_as::<_, EntryRow>(
        r#"
        SELECT id, user_id, date, description, note, dedup_key, excluded_from_budgets,
               created_at, updated_at
          FROM entries
         WHERE user_id = $1 AND dedup_key = $2
         FOR SHARE
        "#,
    )
    .bind(user_id)
    .bind(dedup_key)
    .fetch_optional(&mut **transaction)
    .await?;
    match row {
        Some(row) => Ok(Some(hydrate_in_transaction(transaction, row).await?)),
        None => Ok(None),
    }
}

pub(crate) async fn list_on_date_in_transaction(
    transaction: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    date: NaiveDate,
) -> ApiResult<Vec<EntryResponse>> {
    let rows = sqlx::query_as::<_, EntryRow>(
        r#"
        SELECT id, user_id, date, description, note, dedup_key, excluded_from_budgets,
               created_at, updated_at
          FROM entries
         WHERE user_id = $1 AND date = $2
         ORDER BY id DESC
        "#,
    )
    .bind(user_id)
    .bind(date)
    .fetch_all(&mut **transaction)
    .await?;

    let mut entries = Vec::with_capacity(rows.len());
    for row in rows {
        entries.push(hydrate_in_transaction(transaction, row).await?);
    }
    Ok(entries)
}

pub async fn hydrate(pool: &PgPool, row: EntryRow) -> ApiResult<EntryResponse> {
    let postings = sqlx::query_as::<_, PostingRow>(
        r#"
        SELECT p.id, p.account_id, a.key AS account_key, a.name AS account_name,
               a.type AS account_type, p.amount_minor, p.memo, p.created_at
          FROM postings p
          JOIN accounts a ON a.id = p.account_id
         WHERE p.entry_id = $1 AND p.user_id = $2
         ORDER BY p.created_at, p.id
        "#,
    )
    .bind(row.id)
    .bind(row.user_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|posting| PostingResponse {
        id: posting.id,
        account: AccountSummary {
            id: posting.account_id,
            key: posting.account_key,
            name: posting.account_name,
            r#type: posting.account_type,
        },
        amount_minor: posting.amount_minor,
        memo: posting.memo,
        created_at: posting.created_at,
    })
    .collect();
    Ok(EntryResponse {
        id: row.id,
        date: row.date,
        description: row.description,
        note: row.note,
        dedup_key: row.dedup_key,
        excluded_from_budgets: row.excluded_from_budgets,
        postings,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

pub async fn hydrate_many(
    pool: &PgPool,
    user_id: Uuid,
    rows: Vec<EntryRow>,
) -> ApiResult<Vec<EntryResponse>> {
    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let entry_ids = rows.iter().map(|row| row.id).collect::<Vec<_>>();
    let posting_rows = sqlx::query_as::<_, EntryPostingRow>(
        r#"
        SELECT p.entry_id, p.id, p.account_id, a.key AS account_key,
               a.name AS account_name, a.type AS account_type, p.amount_minor,
               p.memo, p.created_at
          FROM postings p
          JOIN accounts a ON a.id = p.account_id
         WHERE p.entry_id = ANY($1) AND p.user_id = $2
         ORDER BY p.entry_id, p.created_at, p.id
        "#,
    )
    .bind(&entry_ids)
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let mut postings_by_entry = HashMap::<Uuid, Vec<PostingResponse>>::new();
    for posting in posting_rows {
        postings_by_entry
            .entry(posting.entry_id)
            .or_default()
            .push(PostingResponse {
                id: posting.id,
                account: AccountSummary {
                    id: posting.account_id,
                    key: posting.account_key,
                    name: posting.account_name,
                    r#type: posting.account_type,
                },
                amount_minor: posting.amount_minor,
                memo: posting.memo,
                created_at: posting.created_at,
            });
    }

    Ok(rows
        .into_iter()
        .map(|row| {
            let postings = postings_by_entry.remove(&row.id).unwrap_or_default();
            EntryResponse {
                id: row.id,
                date: row.date,
                description: row.description,
                note: row.note,
                dedup_key: row.dedup_key,
                excluded_from_budgets: row.excluded_from_budgets,
                postings,
                created_at: row.created_at,
                updated_at: row.updated_at,
            }
        })
        .collect())
}

pub(crate) async fn hydrate_in_transaction(
    transaction: &mut Transaction<'_, Postgres>,
    row: EntryRow,
) -> ApiResult<EntryResponse> {
    let postings = sqlx::query_as::<_, PostingRow>(
        r#"
        SELECT p.id, p.account_id, a.key AS account_key, a.name AS account_name,
               a.type AS account_type, p.amount_minor, p.memo, p.created_at
          FROM postings p
          JOIN accounts a ON a.id = p.account_id
         WHERE p.entry_id = $1 AND p.user_id = $2
         ORDER BY p.created_at, p.id
        "#,
    )
    .bind(row.id)
    .bind(row.user_id)
    .fetch_all(&mut **transaction)
    .await?
    .into_iter()
    .map(|posting| PostingResponse {
        id: posting.id,
        account: AccountSummary {
            id: posting.account_id,
            key: posting.account_key,
            name: posting.account_name,
            r#type: posting.account_type,
        },
        amount_minor: posting.amount_minor,
        memo: posting.memo,
        created_at: posting.created_at,
    })
    .collect();
    Ok(EntryResponse {
        id: row.id,
        date: row.date,
        description: row.description,
        note: row.note,
        dedup_key: row.dedup_key,
        excluded_from_budgets: row.excluded_from_budgets,
        postings,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

pub async fn resolve_accounts(
    transaction: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    keys: &[String],
) -> ApiResult<Vec<Account>> {
    Ok(sqlx::query_as::<_, Account>(
        r#"
        SELECT id, user_id, key, name, note, type, archived, created_at, updated_at
          FROM accounts
         WHERE user_id = $1 AND key = ANY($2)
         FOR SHARE
        "#,
    )
    .bind(user_id)
    .bind(keys)
    .fetch_all(&mut **transaction)
    .await?)
}

pub async fn lock_entry(
    transaction: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    entry_id: Uuid,
) -> ApiResult<Option<EntryRow>> {
    Ok(sqlx::query_as::<_, EntryRow>(
        r#"
        SELECT id, user_id, date, description, note, dedup_key, excluded_from_budgets,
               created_at, updated_at
          FROM entries
         WHERE id = $1 AND user_id = $2
         FOR UPDATE
        "#,
    )
    .bind(entry_id)
    .bind(user_id)
    .fetch_optional(&mut **transaction)
    .await?)
}

pub async fn existing_postings(
    transaction: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    entry_id: Uuid,
) -> ApiResult<Vec<(Uuid, Uuid)>> {
    Ok(sqlx::query_as::<_, (Uuid, Uuid)>(
        r#"
        SELECT id, account_id
          FROM postings
         WHERE entry_id = $1 AND user_id = $2
         FOR UPDATE
        "#,
    )
    .bind(entry_id)
    .bind(user_id)
    .fetch_all(&mut **transaction)
    .await?)
}

#[allow(clippy::too_many_arguments)]
pub async fn list_rows(
    pool: &PgPool,
    user_id: Uuid,
    date_from: Option<NaiveDate>,
    date_to: Option<NaiveDate>,
    account_key: Option<&str>,
    budget_id: Option<Uuid>,
    query: Option<&str>,
    cursor_date: Option<NaiveDate>,
    cursor_id: Option<Uuid>,
    limit: i64,
) -> ApiResult<Vec<EntryRow>> {
    Ok(sqlx::query_as::<_, EntryRow>(
        r#"
        SELECT e.id, e.user_id, e.date, e.description, e.note, e.dedup_key,
               e.created_at, e.updated_at
          FROM entries e
         WHERE e.user_id = $1
           AND ($2::date IS NULL OR e.date >= $2)
           AND ($3::date IS NULL OR e.date < $3)
           AND (
               $4::text IS NULL OR EXISTS (
                   SELECT 1
                     FROM postings p
                     JOIN accounts a ON a.id = p.account_id
                    WHERE p.entry_id = e.id
                      AND p.user_id = e.user_id
                      AND a.key = $4
               )
           )
           AND (
               $5::uuid IS NULL OR EXISTS (
                   SELECT 1
                     FROM postings budget_posting
                     JOIN budget_accounts ba ON ba.account_id = budget_posting.account_id
                    WHERE budget_posting.entry_id = e.id
                      AND budget_posting.user_id = e.user_id
                      AND ba.user_id = e.user_id
                      AND ba.budget_id = $5
               )
           )
           AND (
               $6::text IS NULL
               OR e.description ILIKE '%' || $6 || '%'
               OR COALESCE(e.note, '') ILIKE '%' || $6 || '%'
               OR EXISTS (
                   SELECT 1
                     FROM postings p
                     JOIN accounts a ON a.id = p.account_id
                    WHERE p.entry_id = e.id
                      AND p.user_id = e.user_id
                      AND (
                          COALESCE(p.memo, '') ILIKE '%' || $6 || '%'
                          OR a.name ILIKE '%' || $6 || '%'
                      )
               )
           )
           AND (
               $7::date IS NULL
               OR (e.date, e.id) < ($7, $8)
           )
         ORDER BY e.date DESC, e.id DESC
         LIMIT $9
        "#,
    )
    .bind(user_id)
    .bind(date_from)
    .bind(date_to)
    .bind(account_key)
    .bind(budget_id)
    .bind(query)
    .bind(cursor_date)
    .bind(cursor_id)
    .bind(limit)
    .fetch_all(pool)
    .await?)
}
