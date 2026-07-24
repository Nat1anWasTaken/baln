use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use serde_json::Value;
use thiserror::Error;

pub type ApiResult<T> = Result<T, ApiError>;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("{detail}")]
    Problem {
        status: StatusCode,
        code: &'static str,
        detail: String,
        fields: Option<Value>,
    },
    #[error("database error")]
    Database(#[from] sqlx::Error),
    #[error("migration error")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("internal error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
struct ProblemBody {
    #[serde(rename = "type")]
    kind: String,
    title: &'static str,
    status: u16,
    code: &'static str,
    detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    fields: Option<Value>,
}

impl ApiError {
    pub fn bad_request(code: &'static str, detail: impl Into<String>) -> Self {
        Self::problem(StatusCode::BAD_REQUEST, code, detail)
    }

    pub fn unauthorized(detail: impl Into<String>) -> Self {
        Self::problem(StatusCode::UNAUTHORIZED, "unauthorized", detail)
    }

    pub fn forbidden(detail: impl Into<String>) -> Self {
        Self::problem(StatusCode::FORBIDDEN, "forbidden", detail)
    }

    pub fn not_found(resource: &'static str) -> Self {
        Self::problem(
            StatusCode::NOT_FOUND,
            "not_found",
            format!("{resource} was not found"),
        )
    }

    pub fn conflict(code: &'static str, detail: impl Into<String>) -> Self {
        Self::problem(StatusCode::CONFLICT, code, detail)
    }

    pub fn service_unavailable(detail: impl Into<String>) -> Self {
        Self::problem(
            StatusCode::SERVICE_UNAVAILABLE,
            "service_unavailable",
            detail,
        )
    }

    pub fn configuration(detail: impl Into<String>) -> Self {
        Self::Internal(format!("configuration error: {}", detail.into()))
    }

    pub fn internal(detail: impl Into<String>) -> Self {
        Self::Internal(detail.into())
    }

    fn problem(status: StatusCode, code: &'static str, detail: impl Into<String>) -> Self {
        Self::Problem {
            status,
            code,
            detail: detail.into(),
            fields: None,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, detail, fields) = match self {
            Self::Problem {
                status,
                code,
                detail,
                fields,
            } => (status, code, detail, fields),
            Self::Database(error) => {
                tracing::error!(error = %error, "database operation failed");
                if let Some(database_error) = error.as_database_error() {
                    match database_error.code().as_deref() {
                        Some("23505") => (
                            StatusCode::CONFLICT,
                            "unique_constraint",
                            "a resource with the same unique value already exists".to_owned(),
                            None,
                        ),
                        Some("23503") | Some("23514") => (
                            StatusCode::UNPROCESSABLE_ENTITY,
                            "constraint_violation",
                            database_error.message().to_owned(),
                            None,
                        ),
                        _ => internal_problem(),
                    }
                } else {
                    internal_problem()
                }
            }
            Self::Migration(error) => {
                tracing::error!(error = %error, "migration operation failed");
                internal_problem()
            }
            Self::Internal(error) => {
                tracing::error!(error = %error, "internal operation failed");
                internal_problem()
            }
        };

        let body = ProblemBody {
            kind: format!("https://baln.local/problems/{code}"),
            title: status.canonical_reason().unwrap_or("Error"),
            status: status.as_u16(),
            code,
            detail,
            fields,
        };

        (
            status,
            [("content-type", "application/problem+json")],
            Json(body),
        )
            .into_response()
    }
}

fn internal_problem() -> (StatusCode, &'static str, String, Option<Value>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "internal_error",
        "an internal error occurred".to_owned(),
        None,
    )
}
