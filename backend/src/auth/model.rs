use std::str::FromStr;

use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts},
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{ApiError, ApiResult, app::AppState};

#[derive(Clone, Debug, FromRow, Serialize, ToSchema)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    #[serde(skip_serializing)]
    pub google_sub: Option<String>,
    pub active: bool,
    #[serde(skip_serializing)]
    pub auth_version: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct AuthenticatedUser(pub User);

#[derive(Clone, Debug)]
pub struct AuthenticatedSession(pub User);

#[derive(Debug, Eq, PartialEq)]
enum BearerCredential {
    Session,
    PersonalApiToken,
}

impl FromRequestParts<AppState> for AuthenticatedUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = bearer_token(parts)?;
        if bearer_credential(token) == BearerCredential::PersonalApiToken {
            return super::api_tokens::authenticate(&state.pool, token)
                .await
                .map(Self);
        }
        load_session_user(state, token).await.map(Self)
    }
}

impl FromRequestParts<AppState> for AuthenticatedSession {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = session_bearer_token(parts)?;
        load_session_user(state, token).await.map(Self)
    }
}

fn bearer_credential(token: &str) -> BearerCredential {
    if token.starts_with(super::api_tokens::TOKEN_PREFIX) {
        BearerCredential::PersonalApiToken
    } else {
        BearerCredential::Session
    }
}

fn bearer_token(parts: &Parts) -> ApiResult<&str> {
    let value = parts
        .headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| ApiError::unauthorized("missing bearer token"))?;
    value
        .strip_prefix("Bearer ")
        .ok_or_else(|| ApiError::unauthorized("invalid authorization scheme"))
}

fn session_bearer_token(parts: &Parts) -> ApiResult<&str> {
    let token = bearer_token(parts)?;
    if bearer_credential(token) == BearerCredential::PersonalApiToken {
        return Err(ApiError::unauthorized(
            "a signed-in browser session is required",
        ));
    }
    Ok(token)
}

async fn load_session_user(state: &AppState, token: &str) -> ApiResult<User> {
    let claims = state.jwt.decode(token)?;
    let user_id =
        Uuid::from_str(&claims.sub).map_err(|_| ApiError::unauthorized("invalid token subject"))?;

    sqlx::query_as::<_, User>(
        r#"
        SELECT id, email::text AS email, display_name, google_sub, active,
               auth_version, created_at, updated_at
          FROM users
         WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?
    .filter(|user| user.active && user.auth_version == claims.auth_version)
    .ok_or_else(|| ApiError::unauthorized("user session is no longer valid"))
}

#[derive(Debug, FromRow)]
pub(crate) struct LoginAttempt {
    pub pkce_verifier: String,
    pub nonce: String,
}

#[derive(Debug, FromRow)]
pub(crate) struct RefreshTokenRow {
    pub id: Uuid,
    pub family_id: Uuid,
    pub user_id: Uuid,
    pub expires_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub replaced_by: Option<Uuid>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn personal_tokens_are_distinct_from_session_jwts() {
        assert_eq!(
            bearer_credential("baln_pat_secret"),
            BearerCredential::PersonalApiToken
        );
        assert_eq!(
            bearer_credential("eyJhbGciOiJIUzI1NiJ9.payload.signature"),
            BearerCredential::Session
        );
        assert_eq!(
            bearer_credential("BALN_PAT_secret"),
            BearerCredential::Session
        );
    }

    #[test]
    fn bearer_header_requires_the_exact_authorization_scheme() {
        let request = axum::http::Request::builder()
            .header(header::AUTHORIZATION, "Bearer token-value")
            .body(())
            .unwrap();
        let (parts, _) = request.into_parts();
        assert_eq!(bearer_token(&parts).unwrap(), "token-value");

        let request = axum::http::Request::builder().body(()).unwrap();
        let (parts, _) = request.into_parts();
        assert!(bearer_token(&parts).is_err());

        let request = axum::http::Request::builder()
            .header(header::AUTHORIZATION, "Basic token-value")
            .body(())
            .unwrap();
        let (parts, _) = request.into_parts();
        assert!(bearer_token(&parts).is_err());
    }

    #[test]
    fn personal_tokens_cannot_satisfy_session_only_authentication() {
        let request = axum::http::Request::builder()
            .header(header::AUTHORIZATION, "Bearer baln_pat_secret")
            .body(())
            .unwrap();
        let (parts, _) = request.into_parts();
        assert!(matches!(
            session_bearer_token(&parts),
            Err(ApiError::Problem {
                code: "unauthorized",
                ..
            })
        ));

        let request = axum::http::Request::builder()
            .header(header::AUTHORIZATION, "Bearer session-jwt")
            .body(())
            .unwrap();
        let (parts, _) = request.into_parts();
        assert_eq!(session_bearer_token(&parts).unwrap(), "session-jwt");
    }
}
