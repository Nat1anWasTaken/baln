use std::collections::{BTreeMap, HashMap, HashSet, hash_map::Entry};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    ApiError, ApiResult,
    accounts::Account,
    entries::{
        CreateEntryRequest, EntryPage, EntryResponse, ListEntriesQuery, PossibleDuplicateMatch,
        PostingInput, UpdateEntryRequest, repository,
    },
};

pub async fn create(
    pool: &PgPool,
    user_id: Uuid,
    request: CreateEntryRequest,
) -> ApiResult<(EntryResponse, bool)> {
    create_batch(pool, user_id, vec![request])
        .await?
        .pop()
        .ok_or_else(|| ApiError::internal("single-entry batch returned no result"))
}

/// Creates or idempotently replays a complete batch in one database
/// transaction. Any validation, account, conflict, or insertion failure rolls
/// the entire batch back.
pub async fn create_batch(
    pool: &PgPool,
    user_id: Uuid,
    requests: Vec<CreateEntryRequest>,
) -> ApiResult<Vec<(EntryResponse, bool)>> {
    if requests.is_empty() {
        return Err(ApiError::bad_request(
            "empty_batch",
            "the batch must contain at least one entry",
        ));
    }
    for request in &requests {
        validate_entry(
            &request.description,
            request.dedup_key.as_deref(),
            &request.postings,
        )?;
    }
    let dedup_keys: Vec<_> = requests
        .iter()
        .filter_map(|request| request.dedup_key.as_deref())
        .collect();
    let unique_keys: HashSet<_> = dedup_keys.iter().copied().collect();
    if unique_keys.len() != dedup_keys.len() {
        return Err(ApiError::bad_request(
            "duplicate_batch_dedup_key",
            "each entry in a batch must have a distinct idempotency key",
        ));
    }

    let mut transaction = pool.begin().await?;
    let mut dates = requests
        .iter()
        .map(|request| request.date)
        .collect::<Vec<_>>();
    dates.sort_unstable();
    dates.dedup();
    for date in dates {
        let lock_key = format!("entry-create:{user_id}:{date}");
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(lock_key)
            .execute(&mut *transaction)
            .await?;
    }

    let mut replayed = Vec::with_capacity(requests.len());
    for request in &requests {
        if let Some(key) = request.dedup_key.as_deref()
            && let Some(existing) =
                repository::get_by_dedup_in_transaction(&mut transaction, user_id, key).await?
        {
            replayed.push(Some(compare_idempotent(existing, request)?));
        } else {
            replayed.push(None);
        }
    }

    let mut entries_by_date = HashMap::new();
    for (index, request) in requests.iter().enumerate() {
        if replayed[index].is_some() {
            continue;
        }
        if let Entry::Vacant(vacant) = entries_by_date.entry(request.date) {
            let entries =
                repository::list_on_date_in_transaction(&mut transaction, user_id, request.date)
                    .await?;
            vacant.insert(entries);
        }
    }

    let mut possible_duplicates = Vec::new();
    for (index, request) in requests.iter().enumerate() {
        if replayed[index].is_some() || request.confirmed_distinct {
            continue;
        }
        let signature = posting_signature(&request.postings);
        let existing_entries = entries_by_date
            .get(&request.date)
            .into_iter()
            .flatten()
            .filter(|entry| {
                !request.dedup_key.as_deref().is_some_and(|key| {
                    entry
                        .dedup_key
                        .as_deref()
                        .is_some_and(|entry_key| entry_key == key)
                }) && response_posting_signature(entry) == signature
            })
            .cloned()
            .collect::<Vec<_>>();
        let pending_entry_numbers = requests[..index]
            .iter()
            .enumerate()
            .filter(|(earlier_index, earlier)| {
                replayed[*earlier_index].is_none()
                    && earlier.date == request.date
                    && posting_signature(&earlier.postings) == signature
            })
            .map(|(earlier_index, _)| earlier_index + 1)
            .collect::<Vec<_>>();
        if !existing_entries.is_empty() || !pending_entry_numbers.is_empty() {
            possible_duplicates.push(PossibleDuplicateMatch {
                pending_entry_number: index + 1,
                existing_entries,
                pending_entry_numbers,
            });
        }
    }
    if !possible_duplicates.is_empty() {
        return Err(ApiError::conflict_with_fields(
            "possible_duplicate",
            "one or more entries may already be recorded",
            json!({"matches": possible_duplicates}),
        ));
    }

    let mut results = Vec::with_capacity(requests.len());
    for (request, replay) in requests.into_iter().zip(replayed) {
        if let Some(replay) = replay {
            results.push(replay);
            continue;
        }
        let accounts = resolve_and_validate_accounts(
            &mut transaction,
            user_id,
            &request.postings,
            &HashSet::new(),
        )
        .await?;
        let entry_id = Uuid::now_v7();
        sqlx::query(
            r#"
            INSERT INTO entries (id, user_id, date, description, note, dedup_key)
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(entry_id)
        .bind(user_id)
        .bind(request.date)
        .bind(&request.description)
        .bind(&request.note)
        .bind(&request.dedup_key)
        .execute(&mut *transaction)
        .await?;
        insert_postings(
            &mut transaction,
            user_id,
            entry_id,
            &request.postings,
            &accounts,
        )
        .await?;
        let row = repository::lock_entry(&mut transaction, user_id, entry_id)
            .await?
            .ok_or_else(|| ApiError::internal("created batch entry disappeared"))?;
        let entry = repository::hydrate_in_transaction(&mut transaction, row).await?;
        results.push((entry, false));
    }
    transaction.commit().await?;
    Ok(results)
}

fn posting_signature(postings: &[PostingInput]) -> Vec<(String, i128)> {
    let mut totals = BTreeMap::<String, i128>::new();
    for posting in postings {
        *totals.entry(posting.account_key.clone()).or_default() += i128::from(posting.amount_minor);
    }
    totals.into_iter().collect()
}

fn response_posting_signature(entry: &EntryResponse) -> Vec<(String, i128)> {
    let mut totals = BTreeMap::<String, i128>::new();
    for posting in &entry.postings {
        *totals.entry(posting.account.key.clone()).or_default() += i128::from(posting.amount_minor);
    }
    totals.into_iter().collect()
}

pub async fn update(
    pool: &PgPool,
    user_id: Uuid,
    entry_id: Uuid,
    request: UpdateEntryRequest,
) -> ApiResult<EntryResponse> {
    validate_entry(&request.description, None, &request.postings)?;
    let mut transaction = pool.begin().await?;
    repository::lock_entry(&mut transaction, user_id, entry_id)
        .await?
        .ok_or_else(|| ApiError::not_found("entry"))?;
    let old_postings = repository::existing_postings(&mut transaction, user_id, entry_id).await?;
    let old_account_ids: HashSet<_> = old_postings
        .iter()
        .map(|(_, account_id)| *account_id)
        .collect();
    let accounts = resolve_and_validate_accounts(
        &mut transaction,
        user_id,
        &request.postings,
        &old_account_ids,
    )
    .await?;

    // New rows are inserted before old rows are removed so the database trigger can
    // recognize grandfathered archived accounts from the original entry.
    insert_postings(
        &mut transaction,
        user_id,
        entry_id,
        &request.postings,
        &accounts,
    )
    .await?;
    let old_ids: Vec<_> = old_postings.into_iter().map(|(id, _)| id).collect();
    sqlx::query("DELETE FROM postings WHERE user_id = $1 AND entry_id = $2 AND id = ANY($3)")
        .bind(user_id)
        .bind(entry_id)
        .bind(&old_ids)
        .execute(&mut *transaction)
        .await?;
    sqlx::query(
        r#"
        UPDATE entries
           SET date = $3, description = $4, note = $5
         WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(entry_id)
    .bind(user_id)
    .bind(request.date)
    .bind(request.description)
    .bind(request.note)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;
    repository::get(pool, user_id, entry_id)
        .await?
        .ok_or_else(|| ApiError::internal("updated entry disappeared"))
}

pub async fn delete(pool: &PgPool, user_id: Uuid, entry_id: Uuid) -> ApiResult<()> {
    let result = sqlx::query("DELETE FROM entries WHERE id = $1 AND user_id = $2")
        .bind(entry_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("entry"));
    }
    Ok(())
}

pub async fn list(pool: &PgPool, user_id: Uuid, query: ListEntriesQuery) -> ApiResult<EntryPage> {
    if query
        .date_from
        .zip(query.date_to)
        .is_some_and(|(from, to)| from >= to)
    {
        return Err(ApiError::bad_request(
            "invalid_date_range",
            "date_from must be before date_to",
        ));
    }
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let cursor = query.cursor.as_deref().map(decode_cursor).transpose()?;
    let rows = repository::list_rows(
        pool,
        user_id,
        query.date_from,
        query.date_to,
        clean(query.account_key.as_deref()),
        clean(query.q.as_deref()),
        cursor.as_ref().map(|cursor| cursor.date),
        cursor.as_ref().map(|cursor| cursor.id),
        limit,
    )
    .await?;
    let next_cursor = if rows.len() == limit as usize {
        rows.last().map(|row| {
            encode_cursor(&EntryCursor {
                date: row.date,
                id: row.id,
            })
        })
    } else {
        None
    };
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        items.push(repository::hydrate(pool, row).await?);
    }
    Ok(EntryPage { items, next_cursor })
}

fn validate_entry(
    description: &str,
    dedup_key: Option<&str>,
    postings: &[PostingInput],
) -> ApiResult<()> {
    if description.trim().is_empty() {
        return Err(ApiError::bad_request(
            "invalid_description",
            "description cannot be empty",
        ));
    }
    if dedup_key.is_some_and(|value| value.trim().is_empty()) {
        return Err(ApiError::bad_request(
            "invalid_dedup_key",
            "dedup_key cannot be empty",
        ));
    }
    if postings.len() < 2 {
        return Err(ApiError::bad_request(
            "insufficient_postings",
            "an entry requires at least two postings",
        ));
    }
    if postings.iter().any(|posting| posting.amount_minor == 0) {
        return Err(ApiError::bad_request(
            "zero_posting",
            "posting amount cannot be zero",
        ));
    }
    let sum: i128 = postings
        .iter()
        .map(|posting| i128::from(posting.amount_minor))
        .sum();
    if sum != 0 {
        return Err(ApiError::bad_request(
            "unbalanced_entry",
            format!("posting amounts must sum to zero (sum={sum})"),
        ));
    }
    if postings
        .iter()
        .any(|posting| posting.account_key.trim().is_empty())
    {
        return Err(ApiError::bad_request(
            "invalid_account_key",
            "posting account_key cannot be empty",
        ));
    }
    Ok(())
}

async fn resolve_and_validate_accounts(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    postings: &[PostingInput],
    grandfathered: &HashSet<Uuid>,
) -> ApiResult<HashMap<String, Account>> {
    let keys: Vec<_> = postings
        .iter()
        .map(|posting| posting.account_key.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let accounts = repository::resolve_accounts(transaction, user_id, &keys).await?;
    if accounts.len() != keys.len() {
        let found: HashSet<_> = accounts
            .iter()
            .map(|account| account.key.as_str())
            .collect();
        let missing = keys
            .iter()
            .filter(|key| !found.contains(key.as_str()))
            .cloned()
            .collect::<Vec<_>>()
            .join(", ");
        return Err(ApiError::bad_request(
            "unknown_account",
            format!("account keys do not exist: {missing}"),
        ));
    }
    if let Some(account) = accounts
        .iter()
        .find(|account| account.archived && !grandfathered.contains(&account.id))
    {
        return Err(ApiError::bad_request(
            "archived_account",
            format!("account {} is archived", account.key),
        ));
    }
    Ok(accounts
        .into_iter()
        .map(|account| (account.key.clone(), account))
        .collect())
}

async fn insert_postings(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    entry_id: Uuid,
    postings: &[PostingInput],
    accounts: &HashMap<String, Account>,
) -> ApiResult<()> {
    for posting in postings {
        let account = accounts
            .get(&posting.account_key)
            .ok_or_else(|| ApiError::internal("resolved account missing"))?;
        sqlx::query(
            r#"
            INSERT INTO postings
                        (id, user_id, entry_id, account_id, amount_minor, memo)
                 VALUES ($1, $2, $3, $4, $5, $6)
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(user_id)
        .bind(entry_id)
        .bind(account.id)
        .bind(posting.amount_minor)
        .bind(&posting.memo)
        .execute(&mut **transaction)
        .await?;
    }
    Ok(())
}

fn compare_idempotent(
    existing: EntryResponse,
    request: &CreateEntryRequest,
) -> ApiResult<(EntryResponse, bool)> {
    let mut existing_postings: Vec<_> = existing
        .postings
        .iter()
        .map(|posting| {
            (
                posting.account.key.clone(),
                posting.amount_minor,
                posting.memo.clone(),
            )
        })
        .collect();
    let mut requested_postings: Vec<_> = request
        .postings
        .iter()
        .map(|posting| {
            (
                posting.account_key.clone(),
                posting.amount_minor,
                posting.memo.clone(),
            )
        })
        .collect();
    existing_postings.sort();
    requested_postings.sort();
    let same = existing.date == request.date
        && existing.description == request.description
        && existing.note == request.note
        && existing_postings == requested_postings;
    if same {
        Ok((existing, true))
    } else {
        Err(ApiError::conflict(
            "dedup_key_conflict",
            "dedup_key already belongs to an entry with different content",
        ))
    }
}

#[derive(Debug, Deserialize, Serialize)]
struct EntryCursor {
    date: NaiveDate,
    id: Uuid,
}

fn encode_cursor(cursor: &EntryCursor) -> String {
    URL_SAFE_NO_PAD.encode(serde_json::to_vec(cursor).expect("cursor serializes"))
}

fn decode_cursor(cursor: &str) -> ApiResult<EntryCursor> {
    let bytes = URL_SAFE_NO_PAD
        .decode(cursor)
        .map_err(|_| ApiError::bad_request("invalid_cursor", "cursor is not valid base64url"))?;
    serde_json::from_slice(&bytes)
        .map_err(|_| ApiError::bad_request("invalid_cursor", "cursor payload is invalid"))
}

fn clean(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;
    use sqlx::PgPool;

    use super::*;

    async fn seed(pool: &PgPool) -> Uuid {
        let user_id = Uuid::now_v7();
        sqlx::query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Test User')")
            .bind(user_id)
            .bind(format!("{user_id}@example.com"))
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
        .bind(Uuid::now_v7())
        .bind(Uuid::now_v7())
        .bind(user_id)
        .execute(pool)
        .await
        .unwrap();
        user_id
    }

    fn request() -> CreateEntryRequest {
        CreateEntryRequest {
            date: NaiveDate::from_ymd_opt(2026, 7, 24).unwrap(),
            description: "麥當勞 早餐".to_owned(),
            note: None,
            dedup_key: Some("manual-message:test".to_owned()),
            confirmed_distinct: false,
            postings: vec![
                PostingInput {
                    account_key: "expense.restaurant".to_owned(),
                    amount_minor: 320,
                    memo: None,
                },
                PostingInput {
                    account_key: "asset.cash".to_owned(),
                    amount_minor: -320,
                    memo: None,
                },
            ],
        }
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn exact_retry_with_same_explicit_key_replays_existing_entry(pool: PgPool) {
        let user_id = seed(&pool).await;
        let (first, replayed) = create(&pool, user_id, request()).await.unwrap();
        assert!(!replayed);
        assert_eq!(first.postings.len(), 2);

        let (second, replayed) = create(&pool, user_id, request()).await.unwrap();
        assert!(replayed);
        assert_eq!(first.id, second.id);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn explicit_key_with_different_content_is_a_conflict(pool: PgPool) {
        let user_id = seed(&pool).await;
        create(&pool, user_id, request()).await.unwrap();
        let mut changed = request();
        changed.description = "Unrelated later transaction".to_owned();

        let error = create(&pool, user_id, changed).await.unwrap_err();
        assert!(matches!(
            error,
            ApiError::Problem {
                code: "dedup_key_conflict",
                ..
            }
        ));
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn possible_duplicate_requires_confirmation_for_a_distinct_operation(pool: PgPool) {
        let user_id = seed(&pool).await;
        let mut original_request = request();
        original_request.dedup_key = None;
        original_request.postings = vec![
            PostingInput {
                account_key: "expense.restaurant".to_owned(),
                amount_minor: 100,
                memo: Some("food".to_owned()),
            },
            PostingInput {
                account_key: "asset.cash".to_owned(),
                amount_minor: -100,
                memo: None,
            },
            PostingInput {
                account_key: "expense.restaurant".to_owned(),
                amount_minor: 220,
                memo: Some("drink".to_owned()),
            },
            PostingInput {
                account_key: "asset.cash".to_owned(),
                amount_minor: -220,
                memo: None,
            },
        ];
        let (first, first_replayed) = create(&pool, user_id, original_request).await.unwrap();
        let mut second_request = request();
        second_request.description = "Apple Pay 午餐".to_owned();
        second_request.dedup_key = None;
        second_request.postings.reverse();

        let error = create(&pool, user_id, second_request.clone())
            .await
            .unwrap_err();
        match error {
            ApiError::Problem {
                code,
                fields: Some(fields),
                ..
            } => {
                assert_eq!(code, "possible_duplicate");
                assert_eq!(fields["matches"][0]["pending_entry_number"], 1);
                assert_eq!(
                    fields["matches"][0]["existing_entries"][0]["id"],
                    first.id.to_string()
                );
            }
            other => panic!("unexpected error: {other:?}"),
        }

        second_request.confirmed_distinct = true;
        let (second, second_replayed) = create(&pool, user_id, second_request).await.unwrap();

        assert!(!first_replayed);
        assert!(!second_replayed);
        assert_ne!(first.id, second.id);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn concurrent_matching_creates_cannot_both_pass_unconfirmed(pool: PgPool) {
        let user_id = seed(&pool).await;
        let first = request();
        let mut second = request();
        second.description = "Email receipt".to_owned();
        second.dedup_key = Some("manual-message:concurrent".to_owned());

        let (first_result, second_result) = tokio::join!(
            create(&pool, user_id, first),
            create(&pool, user_id, second)
        );
        let results = [first_result, second_result];
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert!(results.iter().any(|result| {
            matches!(
                result,
                Err(ApiError::Problem {
                    code: "possible_duplicate",
                    ..
                })
            )
        }));
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM entries WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn same_postings_on_a_different_date_are_not_duplicates(pool: PgPool) {
        let user_id = seed(&pool).await;
        let (first, _) = create(&pool, user_id, request()).await.unwrap();
        let mut next_day = request();
        next_day.date = NaiveDate::from_ymd_opt(2026, 7, 25).unwrap();
        next_day.dedup_key = Some("manual-message:next-day".to_owned());

        let (second, replayed) = create(&pool, user_id, next_day).await.unwrap();
        assert!(!replayed);
        assert_ne!(first.id, second.id);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn batch_creation_is_atomic_when_one_entry_is_invalid(pool: PgPool) {
        let user_id = seed(&pool).await;
        let valid = request();
        let mut invalid = request();
        invalid.description = "計程車".to_owned();
        invalid.dedup_key = Some("manual-message:invalid".to_owned());
        invalid.postings[0].account_key = "expense.transport".to_owned();

        let error = create_batch(&pool, user_id, vec![valid, invalid])
            .await
            .unwrap_err();
        assert!(matches!(
            error,
            ApiError::Problem {
                code: "unknown_account",
                ..
            }
        ));
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM entries WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn batch_exact_retry_replays_without_duplicates(pool: PgPool) {
        let user_id = seed(&pool).await;
        let mut second = request();
        second.description = "晚餐".to_owned();
        second.dedup_key = Some("manual-message:dinner".to_owned());
        second.confirmed_distinct = true;
        let requests = vec![request(), second];

        let first = create_batch(&pool, user_id, requests.clone())
            .await
            .unwrap();
        assert!(first.iter().all(|(_, replayed)| !replayed));
        let replay = create_batch(&pool, user_id, requests).await.unwrap();
        assert!(replay.iter().all(|(_, replayed)| *replayed));
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM entries WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn matching_entries_inside_a_batch_are_rejected_atomically(pool: PgPool) {
        let user_id = seed(&pool).await;
        let mut second = request();
        second.description = "Email receipt".to_owned();
        second.dedup_key = Some("manual-message:email".to_owned());

        let error = create_batch(&pool, user_id, vec![request(), second])
            .await
            .unwrap_err();
        match error {
            ApiError::Problem {
                code,
                fields: Some(fields),
                ..
            } => {
                assert_eq!(code, "possible_duplicate");
                assert_eq!(fields["matches"][0]["pending_entry_number"], 2);
                assert_eq!(fields["matches"][0]["pending_entry_numbers"], json!([1]));
            }
            other => panic!("unexpected error: {other:?}"),
        }
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM entries WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn batch_conflict_rolls_back_new_items(pool: PgPool) {
        let user_id = seed(&pool).await;
        create(&pool, user_id, request()).await.unwrap();

        let mut new_item = request();
        new_item.description = "Would otherwise be inserted".to_owned();
        new_item.dedup_key = Some("manual-message:new-item".to_owned());
        let mut conflicting_item = request();
        conflicting_item.description = "Different content under existing key".to_owned();

        let error = create_batch(&pool, user_id, vec![new_item, conflicting_item])
            .await
            .unwrap_err();
        assert!(matches!(
            error,
            ApiError::Problem {
                code: "dedup_key_conflict",
                ..
            }
        ));
        let descriptions: Vec<String> =
            sqlx::query_scalar("SELECT description FROM entries WHERE user_id = $1")
                .bind(user_id)
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(descriptions, vec!["麥當勞 早餐"]);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn update_replaces_postings_atomically(pool: PgPool) {
        let user_id = seed(&pool).await;
        let (entry, _) = create(&pool, user_id, request()).await.unwrap();
        let updated = update(
            &pool,
            user_id,
            entry.id,
            UpdateEntryRequest {
                date: entry.date,
                description: "麥當勞 午餐".to_owned(),
                note: Some("朋友聚餐".to_owned()),
                postings: vec![
                    PostingInput {
                        account_key: "expense.restaurant".to_owned(),
                        amount_minor: 420,
                        memo: None,
                    },
                    PostingInput {
                        account_key: "asset.cash".to_owned(),
                        amount_minor: -420,
                        memo: None,
                    },
                ],
            },
        )
        .await
        .unwrap();
        assert_eq!(updated.description, "麥當勞 午餐");
        assert_eq!(updated.postings.len(), 2);
        assert_eq!(
            updated
                .postings
                .iter()
                .map(|posting| posting.amount_minor)
                .sum::<i64>(),
            0
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn list_supports_unicode_text_and_account_filters(pool: PgPool) {
        let user_id = seed(&pool).await;
        let mut create_request = request();
        create_request.postings[0].memo = Some("早餐優惠".to_owned());
        create(&pool, user_id, create_request).await.unwrap();

        let page = list(
            &pool,
            user_id,
            ListEntriesQuery {
                date_from: None,
                date_to: None,
                account_key: Some("expense.restaurant".to_owned()),
                q: Some("優惠".to_owned()),
                cursor: None,
                limit: Some(10),
            },
        )
        .await
        .unwrap();
        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].description, "麥當勞 早餐");
    }
}
