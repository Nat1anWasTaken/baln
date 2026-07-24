use openidconnect::{
    AuthenticationFlow, AuthorizationCode, ClientId, ClientSecret, CsrfToken, IssuerUrl, Nonce,
    PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, Scope,
    core::{CoreClient, CoreProviderMetadata, CoreResponseType},
};

use crate::{ApiError, ApiResult, config::AppConfig};

#[derive(Clone)]
pub struct OidcService {
    metadata: CoreProviderMetadata,
    http_client: reqwest::Client,
    client_id: ClientId,
    client_secret: ClientSecret,
    redirect_url: RedirectUrl,
}

pub struct AuthorizationStart {
    pub url: url::Url,
    pub state: String,
    pub pkce_verifier: String,
    pub nonce: String,
}

pub struct GoogleIdentity {
    pub subject: String,
    pub email: String,
    pub email_verified: bool,
}

impl OidcService {
    pub async fn discover(config: &AppConfig) -> ApiResult<Self> {
        let http_client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| ApiError::internal(format!("OIDC HTTP client: {error}")))?;
        let issuer = IssuerUrl::new("https://accounts.google.com".to_owned())
            .map_err(|error| ApiError::configuration(format!("Google issuer: {error}")))?;
        let metadata = CoreProviderMetadata::discover_async(issuer, &http_client)
            .await
            .map_err(|error| {
                ApiError::service_unavailable(format!("OIDC discovery failed: {error}"))
            })?;
        Ok(Self {
            metadata,
            http_client,
            client_id: ClientId::new(config.google_client_id.clone()),
            client_secret: ClientSecret::new(config.google_client_secret.clone()),
            redirect_url: RedirectUrl::new(config.google_redirect_url.clone()).map_err(
                |error| ApiError::configuration(format!("GOOGLE_REDIRECT_URL: {error}")),
            )?,
        })
    }

    pub fn authorization_start(&self) -> AuthorizationStart {
        let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
        let client = CoreClient::from_provider_metadata(
            self.metadata.clone(),
            self.client_id.clone(),
            Some(self.client_secret.clone()),
        )
        .set_redirect_uri(self.redirect_url.clone());
        let (url, state, nonce) = client
            .authorize_url(
                AuthenticationFlow::<CoreResponseType>::AuthorizationCode,
                CsrfToken::new_random,
                Nonce::new_random,
            )
            .add_scope(Scope::new("email".to_owned()))
            .add_scope(Scope::new("profile".to_owned()))
            .set_pkce_challenge(challenge)
            .url();
        AuthorizationStart {
            url,
            state: state.secret().clone(),
            pkce_verifier: verifier.secret().clone(),
            nonce: nonce.secret().clone(),
        }
    }

    pub async fn exchange(
        &self,
        code: String,
        verifier: String,
        nonce: String,
    ) -> ApiResult<GoogleIdentity> {
        let client = CoreClient::from_provider_metadata(
            self.metadata.clone(),
            self.client_id.clone(),
            Some(self.client_secret.clone()),
        )
        .set_redirect_uri(self.redirect_url.clone());
        let token = client
            .exchange_code(AuthorizationCode::new(code))
            .map_err(|error| ApiError::unauthorized(format!("OIDC exchange unavailable: {error}")))?
            .set_pkce_verifier(PkceCodeVerifier::new(verifier))
            .request_async(&self.http_client)
            .await
            .map_err(|error| {
                ApiError::unauthorized(format!("Google rejected the login: {error}"))
            })?;
        let id_token = token
            .extra_fields()
            .id_token()
            .ok_or_else(|| ApiError::unauthorized("Google did not return an ID token"))?;
        let claims = id_token
            .claims(&client.id_token_verifier(), &Nonce::new(nonce))
            .map_err(|error| ApiError::unauthorized(format!("invalid Google ID token: {error}")))?;
        let email = claims
            .email()
            .ok_or_else(|| ApiError::unauthorized("Google account has no email"))?
            .as_str()
            .to_owned();
        Ok(GoogleIdentity {
            subject: claims.subject().as_str().to_owned(),
            email,
            email_verified: claims.email_verified().unwrap_or(false),
        })
    }
}
