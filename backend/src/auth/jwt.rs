use chrono::{Duration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{ApiError, ApiResult, config::AppConfig};

#[derive(Clone)]
pub struct JwtManager {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    issuer: String,
    audience: String,
    ttl_seconds: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AccessClaims {
    pub sub: String,
    pub iss: String,
    pub aud: String,
    pub iat: usize,
    pub exp: usize,
    pub jti: String,
    pub auth_version: i32,
}

impl JwtManager {
    pub fn new(config: &AppConfig) -> Self {
        Self {
            encoding_key: EncodingKey::from_secret(config.jwt_secret.as_bytes()),
            decoding_key: DecodingKey::from_secret(config.jwt_secret.as_bytes()),
            issuer: config.jwt_issuer.clone(),
            audience: config.jwt_audience.clone(),
            ttl_seconds: config.access_token_ttl_seconds,
        }
    }

    pub fn issue(&self, user_id: Uuid, auth_version: i32) -> ApiResult<(String, i64)> {
        let now = Utc::now();
        let expiration = now + Duration::seconds(self.ttl_seconds);
        let claims = AccessClaims {
            sub: user_id.to_string(),
            iss: self.issuer.clone(),
            aud: self.audience.clone(),
            iat: now.timestamp() as usize,
            exp: expiration.timestamp() as usize,
            jti: Uuid::now_v7().to_string(),
            auth_version,
        };
        let token = encode(&Header::new(Algorithm::HS256), &claims, &self.encoding_key)
            .map_err(|error| ApiError::internal(format!("could not issue JWT: {error}")))?;
        Ok((token, self.ttl_seconds))
    }

    pub fn decode(&self, token: &str) -> ApiResult<AccessClaims> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_issuer(&[self.issuer.as_str()]);
        validation.set_audience(&[self.audience.as_str()]);
        decode::<AccessClaims>(token, &self.decoding_key, &validation)
            .map(|data| data.claims)
            .map_err(|_| ApiError::unauthorized("access token is invalid or expired"))
    }
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use super::*;

    fn config() -> AppConfig {
        AppConfig {
            database_url: "postgres://unused".to_owned(),
            bind_addr: "127.0.0.1:8080".parse::<SocketAddr>().unwrap(),
            frontend_origin: "http://localhost:5173".to_owned(),
            frontend_auth_callback_url: "http://localhost:5173/auth/callback".to_owned(),
            google_client_id: "client".to_owned(),
            google_client_secret: "secret".to_owned(),
            google_redirect_url: "http://localhost/callback".to_owned(),
            jwt_secret: "01234567890123456789012345678901".to_owned(),
            jwt_issuer: "test-issuer".to_owned(),
            jwt_audience: "test-audience".to_owned(),
            access_token_ttl_seconds: 900,
            refresh_token_ttl_seconds: 2_592_000,
            cookie_secure: false,
            frontend_dist_dir: std::path::PathBuf::from("../frontend/dist"),
        }
    }

    #[test]
    fn issued_token_round_trips_and_preserves_auth_version() {
        let manager = JwtManager::new(&config());
        let user_id = Uuid::now_v7();
        let (token, expires_in) = manager.issue(user_id, 7).unwrap();
        let claims = manager.decode(&token).unwrap();
        assert_eq!(claims.sub, user_id.to_string());
        assert_eq!(claims.auth_version, 7);
        assert_eq!(expires_in, 900);
    }
}
