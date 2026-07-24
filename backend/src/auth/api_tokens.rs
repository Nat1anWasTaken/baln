use axum::{
    Json,
    extract::{Path, State},
    http::{StatusCode, header},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use rand::{RngCore, rngs::OsRng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    ApiError, ApiResult,
    app::AppState,
    auth::{AuthenticatedSession, User},
};

pub const TOKEN_PREFIX: &str = "baln_pat_";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ApiTokenStatus {
    Active,
    Expired,
}

#[derive(Debug, FromRow)]
struct ApiTokenRow {
    id: Uuid,
    name: String,
    token_hint: String,
    expires_at: Option<DateTime<Utc>>,
    last_used_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
struct AuthenticatedApiTokenRow {
    token_id: Uuid,
    id: Uuid,
    email: String,
    display_name: String,
    google_sub: Option<String>,
    active: bool,
    auth_version: i32,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl AuthenticatedApiTokenRow {
    fn into_user(self) -> User {
        User {
            id: self.id,
            email: self.email,
            display_name: self.display_name,
            google_sub: self.google_sub,
            active: self.active,
            auth_version: self.auth_version,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApiToken {
    pub id: Uuid,
    pub name: String,
    pub token_hint: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub status: ApiTokenStatus,
}

impl From<ApiTokenRow> for ApiToken {
    fn from(row: ApiTokenRow) -> Self {
        let status = if row
            .expires_at
            .is_some_and(|expires_at| expires_at <= Utc::now())
        {
            ApiTokenStatus::Expired
        } else {
            ApiTokenStatus::Active
        };
        Self {
            id: row.id,
            name: row.name,
            token_hint: row.token_hint,
            expires_at: row.expires_at,
            last_used_at: row.last_used_at,
            created_at: row.created_at,
            status,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateApiTokenRequest {
    pub name: String,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CreatedApiToken {
    pub id: Uuid,
    pub name: String,
    pub token_hint: String,
    pub token: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub status: ApiTokenStatus,
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/api-tokens",
    tag = "auth",
    security(("bearer_auth" = [])),
    responses((status = 200, body = [ApiToken]))
)]
pub(crate) async fn list(
    State(state): State<AppState>,
    AuthenticatedSession(user): AuthenticatedSession,
) -> ApiResult<Json<Vec<ApiToken>>> {
    Ok(Json(list_for_user(&state.pool, user.id).await?))
}

async fn list_for_user(pool: &PgPool, user_id: Uuid) -> ApiResult<Vec<ApiToken>> {
    let rows = sqlx::query_as::<_, ApiTokenRow>(
        r#"
        SELECT id, name, token_hint, expires_at, last_used_at, created_at
          FROM api_tokens
         WHERE user_id = $1
           AND revoked_at IS NULL
         ORDER BY created_at DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(ApiToken::from).collect())
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/api-tokens",
    tag = "auth",
    security(("bearer_auth" = [])),
    request_body = CreateApiTokenRequest,
    responses((status = 201, body = CreatedApiToken))
)]
pub(crate) async fn create(
    State(state): State<AppState>,
    AuthenticatedSession(user): AuthenticatedSession,
    Json(request): Json<CreateApiTokenRequest>,
) -> ApiResult<impl axum::response::IntoResponse> {
    let created = create_for_user(&state.pool, user.id, request).await?;

    Ok((
        StatusCode::CREATED,
        [
            (header::CACHE_CONTROL, "no-store"),
            (header::PRAGMA, "no-cache"),
        ],
        Json(created),
    ))
}

async fn create_for_user(
    pool: &PgPool,
    user_id: Uuid,
    request: CreateApiTokenRequest,
) -> ApiResult<CreatedApiToken> {
    let name = validate_request(&request)?;
    let token = generate_token();
    let row = sqlx::query_as::<_, ApiTokenRow>(
        r#"
        INSERT INTO api_tokens (id, user_id, name, token_hash, token_hint, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, token_hint, expires_at, last_used_at, created_at
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(user_id)
    .bind(name)
    .bind(hash(&token))
    .bind(token_hint(&token))
    .bind(request.expires_at)
    .fetch_one(pool)
    .await?;
    let metadata = ApiToken::from(row);

    Ok(CreatedApiToken {
        id: metadata.id,
        name: metadata.name,
        token_hint: metadata.token_hint,
        token,
        expires_at: metadata.expires_at,
        last_used_at: metadata.last_used_at,
        created_at: metadata.created_at,
        status: metadata.status,
    })
}

fn validate_request(request: &CreateApiTokenRequest) -> ApiResult<String> {
    let name = request.name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(ApiError::bad_request(
            "invalid_api_token_name",
            "token name must contain between 1 and 100 characters",
        ));
    }
    if request
        .expires_at
        .is_some_and(|expires_at| expires_at <= Utc::now())
    {
        return Err(ApiError::bad_request(
            "invalid_api_token_expiry",
            "token expiration must be in the future",
        ));
    }
    Ok(name.to_owned())
}

#[utoipa::path(
    delete,
    path = "/api/v1/auth/api-tokens/{id}",
    tag = "auth",
    security(("bearer_auth" = [])),
    params(("id" = Uuid, Path, description = "API token ID")),
    responses(
        (status = 204, description = "API token revoked"),
        (status = 404, description = "API token not found")
    )
)]
pub(crate) async fn revoke(
    State(state): State<AppState>,
    AuthenticatedSession(user): AuthenticatedSession,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    revoke_for_user(&state.pool, user.id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn revoke_for_user(pool: &PgPool, user_id: Uuid, id: Uuid) -> ApiResult<()> {
    let result = sqlx::query(
        r#"
        UPDATE api_tokens
           SET revoked_at = COALESCE(revoked_at, now())
         WHERE id = $1
           AND user_id = $2
        "#,
    )
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::not_found("API token"));
    }
    Ok(())
}

pub(crate) async fn authenticate(pool: &PgPool, token: &str) -> ApiResult<User> {
    let row = sqlx::query_as::<_, AuthenticatedApiTokenRow>(
        r#"
        SELECT token.id AS token_id,
               users.id, users.email::text AS email, users.display_name,
               users.google_sub, users.active, users.auth_version,
               users.created_at, users.updated_at
          FROM api_tokens AS token
          JOIN users ON users.id = token.user_id
         WHERE token.token_hash = $1
           AND token.revoked_at IS NULL
           AND (token.expires_at IS NULL OR token.expires_at > now())
           AND users.active
        "#,
    )
    .bind(hash(token))
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| ApiError::unauthorized("bearer token is invalid or expired"))?;

    sqlx::query(
        r#"
        UPDATE api_tokens
           SET last_used_at = now()
         WHERE id = $1
           AND (last_used_at IS NULL OR last_used_at < now() - interval '1 hour')
        "#,
    )
    .bind(row.token_id)
    .execute(pool)
    .await?;

    Ok(row.into_user())
}

fn generate_token() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    format!("{TOKEN_PREFIX}{}", URL_SAFE_NO_PAD.encode(bytes))
}

fn token_hint(token: &str) -> String {
    let suffix = token.get(token.len().saturating_sub(4)..).unwrap_or(token);
    format!("{TOKEN_PREFIX}…{suffix}")
}

fn hash(value: &str) -> Vec<u8> {
    Sha256::digest(value.as_bytes()).to_vec()
}

#[cfg(test)]
mod tests {
    use chrono::Duration;

    use super::*;

    #[test]
    fn generated_tokens_are_prefixed_and_have_safe_hints() {
        let token = generate_token();
        assert!(token.starts_with(TOKEN_PREFIX));
        assert_eq!(token.len(), TOKEN_PREFIX.len() + 43);
        let hint = token_hint(&token);
        assert!(hint.starts_with("baln_pat_…"));
        assert!(token.ends_with(&hint[hint.len() - 4..]));
        assert!(!hint.contains(&token));
    }

    #[test]
    fn validates_and_normalizes_creation_requests() {
        let valid = CreateApiTokenRequest {
            name: "  Automation  ".to_owned(),
            expires_at: Some(Utc::now() + Duration::days(30)),
        };
        assert_eq!(validate_request(&valid).unwrap(), "Automation");

        for request in [
            CreateApiTokenRequest {
                name: "   ".to_owned(),
                expires_at: None,
            },
            CreateApiTokenRequest {
                name: "x".repeat(101),
                expires_at: None,
            },
        ] {
            assert!(matches!(
                validate_request(&request),
                Err(ApiError::Problem {
                    code: "invalid_api_token_name",
                    ..
                })
            ));
        }

        let expired = CreateApiTokenRequest {
            name: "Expired".to_owned(),
            expires_at: Some(Utc::now() - Duration::seconds(1)),
        };
        assert!(matches!(
            validate_request(&expired),
            Err(ApiError::Problem {
                code: "invalid_api_token_expiry",
                ..
            })
        ));
    }

    async fn seed_user(pool: &PgPool) -> Uuid {
        let user_id = Uuid::now_v7();
        sqlx::query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'API User')")
            .bind(user_id)
            .bind(format!("{user_id}@example.com"))
            .execute(pool)
            .await
            .unwrap();
        user_id
    }

    async fn insert_token(pool: &PgPool, user_id: Uuid, token: &str) -> Uuid {
        let id = Uuid::now_v7();
        sqlx::query(
            r#"
            INSERT INTO api_tokens (id, user_id, name, token_hash, token_hint)
            VALUES ($1, $2, 'Automation', $3, $4)
            "#,
        )
        .bind(id)
        .bind(user_id)
        .bind(hash(token))
        .bind(token_hint(token))
        .execute(pool)
        .await
        .unwrap();
        id
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn creation_hashes_secrets_and_listing_is_tenant_isolated(pool: PgPool) {
        let owner_id = seed_user(&pool).await;
        let other_id = seed_user(&pool).await;
        let created = create_for_user(
            &pool,
            owner_id,
            CreateApiTokenRequest {
                name: "  Automation  ".to_owned(),
                expires_at: None,
            },
        )
        .await
        .unwrap();

        assert_eq!(created.name, "Automation");
        assert!(created.token.starts_with(TOKEN_PREFIX));
        assert_eq!(created.status, ApiTokenStatus::Active);
        let stored: (Vec<u8>, String) =
            sqlx::query_as("SELECT token_hash, token_hint FROM api_tokens WHERE id = $1")
                .bind(created.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(stored.0, hash(&created.token));
        assert_ne!(stored.0, created.token.as_bytes());
        assert_eq!(stored.1, created.token_hint);
        assert!(!stored.1.contains(&created.token));

        let owner_tokens = list_for_user(&pool, owner_id).await.unwrap();
        assert_eq!(owner_tokens.len(), 1);
        assert_eq!(owner_tokens[0].id, created.id);
        assert!(list_for_user(&pool, other_id).await.unwrap().is_empty());
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn listing_includes_expired_tokens_but_omits_revoked_tokens(pool: PgPool) {
        let user_id = seed_user(&pool).await;
        let expired_id = Uuid::now_v7();
        let expired = generate_token();
        sqlx::query(
            r#"
            INSERT INTO api_tokens
                (id, user_id, name, token_hash, token_hint, created_at, expires_at)
            VALUES
                ($1, $2, 'Expired', $3, $4, now() - interval '2 days', now() - interval '1 day')
            "#,
        )
        .bind(expired_id)
        .bind(user_id)
        .bind(hash(&expired))
        .bind(token_hint(&expired))
        .execute(&pool)
        .await
        .unwrap();
        let revoked = generate_token();
        let revoked_id = insert_token(&pool, user_id, &revoked).await;
        sqlx::query("UPDATE api_tokens SET revoked_at = now() WHERE id = $1")
            .bind(revoked_id)
            .execute(&pool)
            .await
            .unwrap();

        let tokens = list_for_user(&pool, user_id).await.unwrap();
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].id, expired_id);
        assert_eq!(tokens[0].status, ApiTokenStatus::Expired);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn revocation_is_owner_scoped_and_idempotent(pool: PgPool) {
        let owner_id = seed_user(&pool).await;
        let other_id = seed_user(&pool).await;
        let token = generate_token();
        let token_id = insert_token(&pool, owner_id, &token).await;

        assert!(matches!(
            revoke_for_user(&pool, other_id, token_id).await,
            Err(ApiError::Problem {
                code: "not_found",
                ..
            })
        ));
        authenticate(&pool, &token).await.unwrap();

        revoke_for_user(&pool, owner_id, token_id).await.unwrap();
        revoke_for_user(&pool, owner_id, token_id).await.unwrap();
        assert!(authenticate(&pool, &token).await.is_err());
        assert!(list_for_user(&pool, owner_id).await.unwrap().is_empty());
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn authenticates_active_tokens_and_throttles_last_used(pool: PgPool) {
        let user_id = seed_user(&pool).await;
        let token = generate_token();
        let token_id = insert_token(&pool, user_id, &token).await;

        let user = authenticate(&pool, &token).await.unwrap();
        assert_eq!(user.id, user_id);
        let first_used: DateTime<Utc> =
            sqlx::query_scalar("SELECT last_used_at FROM api_tokens WHERE id = $1")
                .bind(token_id)
                .fetch_one(&pool)
                .await
                .unwrap();

        sqlx::query("UPDATE users SET auth_version = auth_version + 1 WHERE id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .unwrap();
        authenticate(&pool, &token).await.unwrap();
        let second_used: DateTime<Utc> =
            sqlx::query_scalar("SELECT last_used_at FROM api_tokens WHERE id = $1")
                .bind(token_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(first_used, second_used);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn rejects_revoked_expired_and_disabled_user_tokens(pool: PgPool) {
        let user_id = seed_user(&pool).await;
        assert!(authenticate(&pool, "baln_pat_unknown").await.is_err());

        let revoked = generate_token();
        let revoked_id = insert_token(&pool, user_id, &revoked).await;
        sqlx::query("UPDATE api_tokens SET revoked_at = now() WHERE id = $1")
            .bind(revoked_id)
            .execute(&pool)
            .await
            .unwrap();
        assert!(authenticate(&pool, &revoked).await.is_err());

        let expired = generate_token();
        sqlx::query(
            r#"
            INSERT INTO api_tokens
                (id, user_id, name, token_hash, token_hint, created_at, expires_at)
            VALUES
                ($1, $2, 'Expired', $3, $4, now() - interval '2 days', now() - interval '1 day')
            "#,
        )
        .bind(Uuid::now_v7())
        .bind(user_id)
        .bind(hash(&expired))
        .bind(token_hint(&expired))
        .execute(&pool)
        .await
        .unwrap();
        assert!(authenticate(&pool, &expired).await.is_err());

        let disabled = generate_token();
        insert_token(&pool, user_id, &disabled).await;
        sqlx::query("UPDATE users SET active = FALSE WHERE id = $1")
            .bind(user_id)
            .execute(&pool)
            .await
            .unwrap();
        assert!(authenticate(&pool, &disabled).await.is_err());
    }
}
