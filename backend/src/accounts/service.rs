use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    ApiError, ApiResult,
    accounts::{
        Account, AccountBalance, CreateAccountRequest, UpdateAccountRequest,
        repository::{self, DeleteAccountResult},
    },
};

const MAX_ACCOUNT_NOTE_CHARACTERS: usize = 2_000;

pub async fn create(
    pool: &PgPool,
    user_id: Uuid,
    request: CreateAccountRequest,
) -> ApiResult<Account> {
    let key = request.key.trim();
    let name = request.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request(
            "invalid_account_name",
            "account name cannot be empty",
        ));
    }
    if !valid_key(key, request.r#type.as_str()) {
        return Err(ApiError::bad_request(
            "invalid_account_key",
            "account key must match its type and contain two or three snake_case segments",
        ));
    }
    let note = clean_note(request.note.as_deref())?;
    repository::create(pool, user_id, key, name, note, request.r#type).await
}

pub async fn update(
    pool: &PgPool,
    user_id: Uuid,
    account_id: Uuid,
    request: UpdateAccountRequest,
) -> ApiResult<Account> {
    if request.name.is_none() && request.note.is_none() && request.archived.is_none() {
        return Err(ApiError::bad_request(
            "empty_update",
            "at least one mutable field is required",
        ));
    }
    let name = request.name.as_deref().map(str::trim);
    if name.is_some_and(str::is_empty) {
        return Err(ApiError::bad_request(
            "invalid_account_name",
            "account name cannot be empty",
        ));
    }
    let note = request
        .note
        .as_ref()
        .map(|note| clean_note(note.as_deref()))
        .transpose()?;
    repository::update(pool, user_id, account_id, name, request.archived, note)
        .await?
        .ok_or_else(|| ApiError::not_found("account"))
}

fn clean_note(note: Option<&str>) -> ApiResult<Option<&str>> {
    let note = note.map(str::trim).filter(|note| !note.is_empty());
    if note.is_some_and(|note| note.chars().count() > MAX_ACCOUNT_NOTE_CHARACTERS) {
        return Err(ApiError::bad_request(
            "invalid_account_note",
            "account note cannot exceed 2000 characters",
        ));
    }
    Ok(note)
}

pub async fn balance(
    pool: &PgPool,
    user_id: Uuid,
    account_id: Uuid,
    as_of: Option<NaiveDate>,
) -> ApiResult<AccountBalance> {
    let account = repository::get(pool, user_id, account_id)
        .await?
        .ok_or_else(|| ApiError::not_found("account"))?;
    let raw = repository::raw_balance(pool, user_id, account_id, as_of).await?;
    Ok(AccountBalance {
        account_id,
        account_key: account.key,
        as_of,
        ledger_balance_minor: raw,
        display_balance_minor: account.r#type.normalize_balance(raw),
    })
}

pub async fn delete(pool: &PgPool, user_id: Uuid, account_id: Uuid) -> ApiResult<()> {
    match repository::delete(pool, user_id, account_id).await? {
        DeleteAccountResult::Deleted => Ok(()),
        DeleteAccountResult::NotFound => Err(ApiError::not_found("account")),
        DeleteAccountResult::InUse => Err(ApiError::conflict(
            "account_in_use",
            "accounts referenced by ledger postings must be archived instead of deleted",
        )),
    }
}

fn valid_key(key: &str, expected_type: &str) -> bool {
    let parts: Vec<_> = key.split('.').collect();
    (parts.len() == 2 || parts.len() == 3)
        && parts.first() == Some(&expected_type)
        && parts.iter().all(|part| {
            let mut characters = part.chars();
            characters
                .next()
                .is_some_and(|first| first.is_ascii_lowercase())
                && characters.all(|character| {
                    character.is_ascii_lowercase() || character.is_ascii_digit() || character == '_'
                })
        })
}

#[cfg(test)]
mod tests {
    use axum::http::StatusCode;

    use super::*;
    use crate::accounts::AccountType;

    async fn seed_user(pool: &PgPool) -> Uuid {
        let user_id = Uuid::now_v7();
        sqlx::query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Test User')")
            .bind(user_id)
            .bind(format!("{user_id}@example.com"))
            .execute(pool)
            .await
            .unwrap();
        user_id
    }

    async fn seed_account(
        pool: &PgPool,
        user_id: Uuid,
        key: &str,
        account_type: AccountType,
    ) -> Account {
        repository::create(pool, user_id, key, key, None, account_type)
            .await
            .unwrap()
    }

    #[test]
    fn update_note_distinguishes_omitted_from_null() {
        let omitted: UpdateAccountRequest = serde_json::from_value(serde_json::json!({})).unwrap();
        assert!(omitted.note.is_none());

        let cleared: UpdateAccountRequest =
            serde_json::from_value(serde_json::json!({"note": null})).unwrap();
        assert_eq!(cleared.note, Some(None));
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn account_notes_are_normalized_searchable_and_clearable(pool: PgPool) {
        let user_id = seed_user(&pool).await;
        let account = create(
            &pool,
            user_id,
            CreateAccountRequest {
                key: "asset.post".to_owned(),
                name: "郵局".to_owned(),
                note: Some("  連結到郵局金融卡  ".to_owned()),
                r#type: AccountType::Asset,
            },
        )
        .await
        .unwrap();
        assert_eq!(account.note.as_deref(), Some("連結到郵局金融卡"));

        let matches = repository::list(&pool, user_id, false, Some("金融卡"))
            .await
            .unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].id, account.id);

        let renamed = update(
            &pool,
            user_id,
            account.id,
            UpdateAccountRequest {
                name: Some("中華郵政".to_owned()),
                note: None,
                archived: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(renamed.note.as_deref(), Some("連結到郵局金融卡"));

        let cleared = update(
            &pool,
            user_id,
            account.id,
            UpdateAccountRequest {
                name: None,
                note: Some(None),
                archived: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(cleared.note, None);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn account_notes_cannot_exceed_limit(pool: PgPool) {
        let user_id = seed_user(&pool).await;
        let error = create(
            &pool,
            user_id,
            CreateAccountRequest {
                key: "asset.post".to_owned(),
                name: "郵局".to_owned(),
                note: Some("字".repeat(MAX_ACCOUNT_NOTE_CHARACTERS + 1)),
                r#type: AccountType::Asset,
            },
        )
        .await
        .unwrap_err();
        assert!(matches!(
            error,
            ApiError::Problem {
                status: StatusCode::BAD_REQUEST,
                code: "invalid_account_note",
                ..
            }
        ));

        let database_error = sqlx::query(
            "INSERT INTO accounts (id, user_id, key, name, note, type) \
             VALUES ($1, $2, 'asset.direct', 'Direct', $3, 'asset')",
        )
        .bind(Uuid::now_v7())
        .bind(user_id)
        .bind("字".repeat(MAX_ACCOUNT_NOTE_CHARACTERS + 1))
        .execute(&pool)
        .await;
        assert!(database_error.is_err());
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn deletion_only_removes_unused_tenant_owned_accounts(pool: PgPool) {
        let user_id = seed_user(&pool).await;
        let other_user_id = seed_user(&pool).await;
        let unused = seed_account(&pool, user_id, "asset.savings", AccountType::Asset).await;
        let cash = seed_account(&pool, user_id, "asset.cash", AccountType::Asset).await;
        let expense =
            seed_account(&pool, user_id, "expense.restaurant", AccountType::Expense).await;

        let entry_id = Uuid::now_v7();
        let mut transaction = pool.begin().await.unwrap();
        sqlx::query(
            "INSERT INTO entries (id, user_id, date, description) VALUES ($1, $2, '2026-07-25', '早餐')",
        )
        .bind(entry_id)
        .bind(user_id)
        .execute(&mut *transaction)
        .await
        .unwrap();
        for (account_id, amount) in [(cash.id, -100_i64), (expense.id, 100_i64)] {
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

        delete(&pool, user_id, unused.id).await.unwrap();
        assert!(
            repository::get(&pool, user_id, unused.id)
                .await
                .unwrap()
                .is_none()
        );

        let in_use = delete(&pool, user_id, cash.id).await.unwrap_err();
        assert!(matches!(
            in_use,
            ApiError::Problem {
                status: StatusCode::CONFLICT,
                code: "account_in_use",
                ..
            }
        ));
        assert!(
            repository::get(&pool, user_id, cash.id)
                .await
                .unwrap()
                .is_some()
        );

        let wrong_user = delete(&pool, other_user_id, expense.id).await.unwrap_err();
        assert!(matches!(
            wrong_user,
            ApiError::Problem {
                status: StatusCode::NOT_FOUND,
                code: "not_found",
                ..
            }
        ));
        assert!(
            repository::get(&pool, user_id, expense.id)
                .await
                .unwrap()
                .is_some()
        );
    }
}
