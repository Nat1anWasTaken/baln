use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    ApiError, ApiResult,
    accounts::{Account, AccountBalance, CreateAccountRequest, UpdateAccountRequest, repository},
};

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
    repository::create(pool, user_id, key, name, request.r#type).await
}

pub async fn update(
    pool: &PgPool,
    user_id: Uuid,
    account_id: Uuid,
    request: UpdateAccountRequest,
) -> ApiResult<Account> {
    if request.name.is_none() && request.archived.is_none() {
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
    repository::update(pool, user_id, account_id, name, request.archived)
        .await?
        .ok_or_else(|| ApiError::not_found("account"))
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
