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

use crate::{ApiError, app::AppState};

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

impl FromRequestParts<AppState> for AuthenticatedUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let value = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| ApiError::unauthorized("missing bearer token"))?;
        let token = value
            .strip_prefix("Bearer ")
            .ok_or_else(|| ApiError::unauthorized("invalid authorization scheme"))?;
        let claims = state.jwt.decode(token)?;
        let user_id = Uuid::from_str(&claims.sub)
            .map_err(|_| ApiError::unauthorized("invalid token subject"))?;

        let user = sqlx::query_as::<_, User>(
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
        .ok_or_else(|| ApiError::unauthorized("user session is no longer valid"))?;

        Ok(Self(user))
    }
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
