use std::{path::PathBuf, sync::Arc, time::Duration};

use axum::{
    Json, Router,
    body::Body,
    extract::State,
    http::{HeaderName, HeaderValue, Method, Request, Response, StatusCode, header},
    response::IntoResponse,
    routing::get,
};
use serde_json::json;
use sqlx::PgPool;
use tower::ServiceBuilder;
use tower_http::{
    catch_panic::CatchPanicLayer,
    compression::CompressionLayer,
    cors::CorsLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    services::ServeDir,
    set_header::SetResponseHeaderLayer,
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use utoipa_swagger_ui::SwaggerUi;

use crate::{
    ApiResult,
    auth::{AuthService, JwtManager, OidcService},
    config::AppConfig,
    db,
    openapi::ApiDoc,
};
use utoipa::OpenApi;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<AppConfig>,
    pub jwt: JwtManager,
    pub auth: AuthService,
}

impl AppState {
    pub async fn initialize(config: AppConfig) -> ApiResult<Self> {
        let pool = db::connect(&config).await?;
        let jwt = JwtManager::new(&config);
        let oidc = OidcService::discover(&config).await?;
        let auth = AuthService::new(pool.clone(), oidc, jwt.clone(), &config);
        Ok(Self {
            pool,
            config: Arc::new(config),
            jwt,
            auth,
        })
    }
}

pub fn build_app(state: AppState) -> ApiResult<Router> {
    let origin = HeaderValue::from_str(&state.config.frontend_origin)
        .map_err(|error| crate::ApiError::configuration(format!("FRONTEND_ORIGIN: {error}")))?;
    let request_id = HeaderName::from_static("x-request-id");
    let dist_dir = state.config.frontend_dist_dir.clone();
    if !dist_dir.join("index.html").is_file() {
        tracing::warn!(path = %dist_dir.join("index.html").display(), "frontend build not found; API routes remain available");
    }
    let api = Router::new()
        .nest("/auth", crate::auth::router())
        .nest("/accounts", crate::accounts::router())
        .nest("/entries", crate::entries::router())
        .nest("/reports", crate::reports::router())
        .fallback(api_not_found);
    let assets = ServeDir::new(dist_dir.join("assets")).append_index_html_on_directories(false);
    let app = Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .nest("/api/v1", api)
        .nest("/api", Router::new().fallback(api_not_found))
        .merge(SwaggerUi::new("/api/docs").url("/api/openapi.json", ApiDoc::openapi()))
        .nest_service(
            "/assets",
            ServiceBuilder::new()
                .layer(SetResponseHeaderLayer::overriding(
                    header::CACHE_CONTROL,
                    HeaderValue::from_static("public, max-age=31536000, immutable"),
                ))
                .service(assets),
        )
        .fallback(spa_fallback)
        .with_state(state)
        .layer(CompressionLayer::new().br(true).gzip(true))
        .layer(PropagateRequestIdLayer::new(request_id.clone()))
        .layer(SetRequestIdLayer::new(request_id, MakeRequestUuid))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(30),
        ))
        .layer(CatchPanicLayer::new())
        .layer(TraceLayer::new_for_http())
        .layer(
            CorsLayer::new()
                .allow_origin(origin)
                .allow_credentials(true)
                .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::PATCH,
                    Method::DELETE,
                ]),
        );
    Ok(app)
}

async fn api_not_found() -> Response<Body> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "application/problem+json")
        .body(Body::from(
            json!({
                "type": "about:blank",
                "title": "Not Found",
                "status": 404,
                "detail": "The requested API route does not exist"
            })
            .to_string(),
        ))
        .expect("valid problem response")
}

async fn spa_fallback(State(state): State<AppState>, request: Request<Body>) -> Response<Body> {
    if !matches!(*request.method(), Method::GET | Method::HEAD) {
        return StatusCode::NOT_FOUND.into_response();
    }

    serve_index(
        &state.config.frontend_dist_dir,
        request.method() == Method::HEAD,
    )
    .await
}

async fn serve_index(dist_dir: &PathBuf, head: bool) -> Response<Body> {
    match tokio::fs::read(dist_dir.join("index.html")).await {
        Ok(content) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CACHE_CONTROL, "no-cache")
            .body(if head {
                Body::empty()
            } else {
                Body::from(content)
            })
            .expect("valid index response"),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            StatusCode::NOT_FOUND.into_response()
        }
        Err(error) => {
            tracing::error!(%error, "failed to read frontend index");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn live() -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::OK, Json(json!({"status": "ok"})))
}

async fn ready(State(state): State<AppState>) -> ApiResult<Json<serde_json::Value>> {
    db::ready(&state.pool).await?;
    Ok(Json(json!({"status": "ready"})))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_dist() -> PathBuf {
        std::env::temp_dir().join(format!("baln-spa-test-{}", uuid::Uuid::now_v7()))
    }

    #[tokio::test]
    async fn serves_index_for_browser_navigation_with_no_cache() {
        let dist = temporary_dist();
        tokio::fs::create_dir_all(&dist).await.unwrap();
        tokio::fs::write(dist.join("index.html"), "<main>Baln</main>")
            .await
            .unwrap();

        let response = serve_index(&dist, false).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CACHE_CONTROL], "no-cache");
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "text/html; charset=utf-8"
        );
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert_eq!(body, "<main>Baln</main>");
        tokio::fs::remove_dir_all(dist).await.unwrap();
    }

    #[tokio::test]
    async fn supports_head_and_a_missing_frontend_build() {
        let dist = temporary_dist();
        tokio::fs::create_dir_all(&dist).await.unwrap();
        tokio::fs::write(dist.join("index.html"), "content")
            .await
            .unwrap();
        let head = serve_index(&dist, true).await;
        assert!(
            axum::body::to_bytes(head.into_body(), usize::MAX)
                .await
                .unwrap()
                .is_empty()
        );
        tokio::fs::remove_dir_all(&dist).await.unwrap();
        assert_eq!(
            serve_index(&dist, false).await.status(),
            StatusCode::NOT_FOUND
        );
    }

    #[tokio::test]
    async fn api_fallback_is_problem_json() {
        let response = api_not_found().await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "application/problem+json"
        );
    }
}
