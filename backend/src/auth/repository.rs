use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    ApiError, ApiResult,
    auth::model::{LoginAttempt, RefreshTokenRow, User},
};

pub async fn store_login_attempt(
    pool: &PgPool,
    state_hash: &[u8],
    verifier: &str,
    nonce: &str,
    expires_at: DateTime<Utc>,
) -> ApiResult<()> {
    sqlx::query(
        r#"
        INSERT INTO oidc_login_attempts
                    (state_hash, pkce_verifier, nonce, expires_at)
             VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(state_hash)
    .bind(verifier)
    .bind(nonce)
    .bind(expires_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn consume_login_attempt(pool: &PgPool, state_hash: &[u8]) -> ApiResult<LoginAttempt> {
    sqlx::query_as::<_, LoginAttempt>(
        r#"
        DELETE FROM oidc_login_attempts
              WHERE state_hash = $1
                AND expires_at > now()
          RETURNING pkce_verifier, nonce
        "#,
    )
    .bind(state_hash)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| ApiError::unauthorized("OIDC state is invalid or expired"))
}

pub async fn link_google_identity(pool: &PgPool, email: &str, subject: &str) -> ApiResult<User> {
    let mut transaction = pool.begin().await?;
    let mut user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, email::text AS email, display_name, google_sub, active,
               auth_version, created_at, updated_at
          FROM users
         WHERE email = $1
         FOR UPDATE
        "#,
    )
    .bind(email)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| ApiError::forbidden("this Google account has not been provisioned"))?;

    if !user.active {
        return Err(ApiError::forbidden("this user is disabled"));
    }
    if let Some(existing) = user.google_sub.as_deref() {
        if existing != subject {
            return Err(ApiError::forbidden(
                "the provisioned email is linked to another Google identity",
            ));
        }
    } else {
        sqlx::query("UPDATE users SET google_sub = $2 WHERE id = $1")
            .bind(user.id)
            .bind(subject)
            .execute(&mut *transaction)
            .await?;
        user.google_sub = Some(subject.to_owned());
    }
    transaction.commit().await?;
    Ok(user)
}

pub async fn store_exchange_code(
    pool: &PgPool,
    hash: &[u8],
    user_id: Uuid,
    expires_at: DateTime<Utc>,
) -> ApiResult<()> {
    sqlx::query(
        r#"
        INSERT INTO auth_exchange_codes (code_hash, user_id, expires_at)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(hash)
    .bind(user_id)
    .bind(expires_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn consume_exchange_code(pool: &PgPool, hash: &[u8]) -> ApiResult<User> {
    let mut transaction = pool.begin().await?;
    let user_id: Uuid = sqlx::query_scalar(
        r#"
        UPDATE auth_exchange_codes
           SET used_at = now()
         WHERE code_hash = $1
           AND used_at IS NULL
           AND expires_at > now()
        RETURNING user_id
        "#,
    )
    .bind(hash)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| ApiError::unauthorized("exchange code is invalid or expired"))?;
    let user = load_active_user(&mut transaction, user_id).await?;
    transaction.commit().await?;
    Ok(user)
}

pub async fn insert_refresh_token(
    transaction: &mut Transaction<'_, Postgres>,
    id: Uuid,
    family_id: Uuid,
    user_id: Uuid,
    hash: &[u8],
    expires_at: DateTime<Utc>,
) -> ApiResult<()> {
    sqlx::query(
        r#"
        INSERT INTO refresh_tokens
                    (id, family_id, user_id, token_hash, expires_at)
             VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(id)
    .bind(family_id)
    .bind(user_id)
    .bind(hash)
    .bind(expires_at)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

pub async fn lock_refresh_token(
    transaction: &mut Transaction<'_, Postgres>,
    hash: &[u8],
) -> ApiResult<RefreshTokenRow> {
    sqlx::query_as::<_, RefreshTokenRow>(
        r#"
        SELECT id, family_id, user_id, expires_at, revoked_at, replaced_by
          FROM refresh_tokens
         WHERE token_hash = $1
         FOR UPDATE
        "#,
    )
    .bind(hash)
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or_else(|| ApiError::unauthorized("refresh token is invalid"))
}

pub async fn load_active_user(
    transaction: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
) -> ApiResult<User> {
    sqlx::query_as::<_, User>(
        r#"
        SELECT id, email::text AS email, display_name, google_sub, active,
               auth_version, created_at, updated_at
          FROM users
         WHERE id = $1
           AND active = TRUE
        "#,
    )
    .bind(user_id)
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or_else(|| ApiError::unauthorized("user is disabled or missing"))
}

pub async fn cleanup_expired(pool: &PgPool) -> ApiResult<()> {
    sqlx::query("DELETE FROM oidc_login_attempts WHERE expires_at <= now()")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM auth_exchange_codes WHERE expires_at <= now() OR used_at IS NOT NULL")
        .execute(pool)
        .await?;
    Ok(())
}
