use std::{env, net::SocketAddr, str::FromStr};

use chrono_tz::Tz;

use crate::error::{ApiError, ApiResult};

#[derive(Clone)]
pub struct AppConfig {
    pub database_url: String,
    pub bind_addr: SocketAddr,
    pub frontend_origin: String,
    pub frontend_auth_callback_url: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub google_redirect_url: String,
    pub jwt_secret: String,
    pub jwt_issuer: String,
    pub jwt_audience: String,
    pub access_token_ttl_seconds: i64,
    pub refresh_token_ttl_seconds: i64,
    pub cookie_secure: bool,
    pub public_base_url: String,
    pub bookkeeping_timezone: Tz,
    pub oauth_access_token_ttl_seconds: i64,
    pub oauth_refresh_token_ttl_seconds: i64,
}

impl AppConfig {
    pub fn from_env() -> ApiResult<Self> {
        let _ = dotenvy::dotenv();

        Ok(Self {
            database_url: required("DATABASE_URL")?,
            bind_addr: parse_or("BIND_ADDR", "127.0.0.1:8080")?,
            frontend_origin: required("FRONTEND_ORIGIN")?,
            frontend_auth_callback_url: required("FRONTEND_AUTH_CALLBACK_URL")?,
            google_client_id: required("GOOGLE_CLIENT_ID")?,
            google_client_secret: required("GOOGLE_CLIENT_SECRET")?,
            google_redirect_url: required("GOOGLE_REDIRECT_URL")?,
            jwt_secret: validate_jwt_secret(required("JWT_SECRET")?)?,
            jwt_issuer: value_or("JWT_ISSUER", "baln-backend"),
            jwt_audience: value_or("JWT_AUDIENCE", "baln-api"),
            access_token_ttl_seconds: parse_or("ACCESS_TOKEN_TTL_SECONDS", "900")?,
            refresh_token_ttl_seconds: parse_or("REFRESH_TOKEN_TTL_SECONDS", "2592000")?,
            cookie_secure: parse_or("COOKIE_SECURE", "true")?,
            public_base_url: public_base_url(required("PUBLIC_BASE_URL")?)?,
            bookkeeping_timezone: parse_or("BOOKKEEPING_TIMEZONE", "Asia/Taipei")?,
            oauth_access_token_ttl_seconds: positive_seconds(
                "OAUTH_ACCESS_TOKEN_TTL_SECONDS",
                parse_or("OAUTH_ACCESS_TOKEN_TTL_SECONDS", "900")?,
            )?,
            oauth_refresh_token_ttl_seconds: positive_seconds(
                "OAUTH_REFRESH_TOKEN_TTL_SECONDS",
                parse_or("OAUTH_REFRESH_TOKEN_TTL_SECONDS", "2592000")?,
            )?,
        })
    }
}

fn required(name: &str) -> ApiResult<String> {
    env::var(name).map_err(|_| ApiError::configuration(format!("{name} is required")))
}

fn value_or(name: &str, default: &str) -> String {
    env::var(name).unwrap_or_else(|_| default.to_owned())
}

fn parse_or<T>(name: &str, default: &str) -> ApiResult<T>
where
    T: FromStr,
    T::Err: std::fmt::Display,
{
    value_or(name, default)
        .parse()
        .map_err(|error| ApiError::configuration(format!("invalid {name}: {error}")))
}

fn validate_jwt_secret(secret: String) -> ApiResult<String> {
    if secret.len() < 32 {
        return Err(ApiError::configuration(
            "JWT_SECRET must contain at least 32 bytes",
        ));
    }
    Ok(secret)
}

fn public_base_url(value: String) -> ApiResult<String> {
    let normalized = value.trim_end_matches('/').to_owned();
    let url = url::Url::parse(&normalized)
        .map_err(|error| ApiError::configuration(format!("PUBLIC_BASE_URL: {error}")))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return Err(ApiError::configuration(
            "PUBLIC_BASE_URL must be an HTTP(S) origin without a path, query, or fragment",
        ));
    }
    Ok(normalized)
}

fn positive_seconds(name: &str, value: i64) -> ApiResult<i64> {
    if value <= 0 {
        return Err(ApiError::configuration(format!(
            "{name} must be greater than zero"
        )));
    }
    Ok(value)
}
