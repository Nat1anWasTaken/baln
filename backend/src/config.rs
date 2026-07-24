use std::{env, net::SocketAddr, str::FromStr};

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
