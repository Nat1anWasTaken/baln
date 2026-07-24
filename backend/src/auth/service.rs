use std::sync::Arc;

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{Duration, Utc};
use rand::{RngCore, rngs::OsRng};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    ApiError, ApiResult,
    auth::{JwtManager, OidcService, model::User, repository},
    config::AppConfig,
};

#[derive(Clone)]
pub struct AuthService {
    pool: PgPool,
    oidc: Arc<OidcService>,
    jwt: JwtManager,
    frontend_callback_url: String,
    refresh_ttl_seconds: i64,
}

pub struct LoginRedirect {
    pub url: String,
}

pub struct CallbackResult {
    pub frontend_redirect: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: &'static str,
    pub expires_in: i64,
}

pub struct IssuedTokens {
    pub response: TokenResponse,
    pub refresh_token: String,
}

impl AuthService {
    pub fn new(pool: PgPool, oidc: OidcService, jwt: JwtManager, config: &AppConfig) -> Self {
        Self {
            pool,
            oidc: Arc::new(oidc),
            jwt,
            frontend_callback_url: config.frontend_auth_callback_url.clone(),
            refresh_ttl_seconds: config.refresh_token_ttl_seconds,
        }
    }

    pub async fn start_login(&self) -> ApiResult<LoginRedirect> {
        repository::cleanup_expired(&self.pool).await?;
        let start = self.oidc.authorization_start();
        repository::store_login_attempt(
            &self.pool,
            &hash(&start.state),
            &start.pkce_verifier,
            &start.nonce,
            Utc::now() + Duration::minutes(10),
        )
        .await?;
        Ok(LoginRedirect {
            url: start.url.to_string(),
        })
    }

    pub async fn finish_callback(&self, code: String, state: String) -> ApiResult<CallbackResult> {
        let attempt = repository::consume_login_attempt(&self.pool, &hash(&state)).await?;
        let identity = self
            .oidc
            .exchange(code, attempt.pkce_verifier, attempt.nonce)
            .await?;
        if !identity.email_verified {
            return Err(ApiError::forbidden("Google email is not verified"));
        }
        let user = repository::link_google_identity(&self.pool, &identity.email, &identity.subject)
            .await?;
        let code = random_token();
        repository::store_exchange_code(
            &self.pool,
            &hash(&code),
            user.id,
            Utc::now() + Duration::seconds(60),
        )
        .await?;
        let mut redirect = url::Url::parse(&self.frontend_callback_url)
            .map_err(|error| ApiError::internal(format!("frontend callback URL: {error}")))?;
        redirect.query_pairs_mut().append_pair("code", &code);
        Ok(CallbackResult {
            frontend_redirect: redirect.to_string(),
        })
    }

    pub async fn exchange_code(&self, code: &str) -> ApiResult<IssuedTokens> {
        let user = repository::consume_exchange_code(&self.pool, &hash(code)).await?;
        self.issue_token_pair(&user).await
    }

    pub async fn refresh(&self, raw_token: &str) -> ApiResult<IssuedTokens> {
        let mut transaction = self.pool.begin().await?;
        let current = repository::lock_refresh_token(&mut transaction, &hash(raw_token)).await?;
        if current.revoked_at.is_some() {
            if current.replaced_by.is_some() {
                sqlx::query(
                    "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1",
                )
                .bind(current.family_id)
                .execute(&mut *transaction)
                .await?;
                transaction.commit().await?;
            }
            return Err(ApiError::unauthorized(
                "refresh token has already been used",
            ));
        }
        if current.expires_at <= Utc::now() {
            sqlx::query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1")
                .bind(current.id)
                .execute(&mut *transaction)
                .await?;
            transaction.commit().await?;
            return Err(ApiError::unauthorized("refresh token has expired"));
        }
        let user = repository::load_active_user(&mut transaction, current.user_id).await?;
        let replacement_id = Uuid::now_v7();
        let replacement = random_token();
        repository::insert_refresh_token(
            &mut transaction,
            replacement_id,
            current.family_id,
            user.id,
            &hash(&replacement),
            Utc::now() + Duration::seconds(self.refresh_ttl_seconds),
        )
        .await?;
        sqlx::query(
            r#"
            UPDATE refresh_tokens
               SET revoked_at = now(), replaced_by = $2, last_used_at = now()
             WHERE id = $1
            "#,
        )
        .bind(current.id)
        .bind(replacement_id)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        let (access_token, expires_in) = self.jwt.issue(user.id, user.auth_version)?;
        Ok(IssuedTokens {
            response: TokenResponse {
                access_token,
                token_type: "Bearer",
                expires_in,
            },
            refresh_token: replacement,
        })
    }

    pub async fn logout(&self, raw_token: &str) -> ApiResult<()> {
        sqlx::query(
            "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1",
        )
        .bind(hash(raw_token))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn issue_token_pair(&self, user: &User) -> ApiResult<IssuedTokens> {
        let refresh_token = random_token();
        let mut transaction = self.pool.begin().await?;
        let id = Uuid::now_v7();
        repository::insert_refresh_token(
            &mut transaction,
            id,
            id,
            user.id,
            &hash(&refresh_token),
            Utc::now() + Duration::seconds(self.refresh_ttl_seconds),
        )
        .await?;
        transaction.commit().await?;
        let (access_token, expires_in) = self.jwt.issue(user.id, user.auth_version)?;
        Ok(IssuedTokens {
            response: TokenResponse {
                access_token,
                token_type: "Bearer",
                expires_in,
            },
            refresh_token,
        })
    }
}

fn random_token() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn hash(value: &str) -> Vec<u8> {
    Sha256::digest(value.as_bytes()).to_vec()
}
