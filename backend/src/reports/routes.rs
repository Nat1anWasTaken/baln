use axum::{
    Json, Router,
    extract::{Query, State},
    routing::get,
};
use chrono::{Datelike, Months, NaiveDate};
use serde::Deserialize;
use utoipa::IntoParams;

use crate::{
    ApiError, ApiResult,
    app::AppState,
    auth::AuthenticatedUser,
    reports::{PeriodSummary, repository},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/summary", get(summary))
        .route("/monthly", get(monthly))
}

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct SummaryQuery {
    date_from: NaiveDate,
    date_to: NaiveDate,
}

#[utoipa::path(
    get,
    path = "/api/v1/reports/summary",
    tag = "reports",
    security(("bearer_auth" = [])),
    params(
        ("date_from" = NaiveDate, Query),
        ("date_to" = NaiveDate, Query)
    ),
    responses((status = 200, body = PeriodSummary))
)]
pub(crate) async fn summary(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Query(query): Query<SummaryQuery>,
) -> ApiResult<Json<PeriodSummary>> {
    validate_range(query.date_from, query.date_to)?;
    Ok(Json(
        repository::summary(&state.pool, user.id, query.date_from, query.date_to).await?,
    ))
}

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct MonthlyQuery {
    /// Calendar month in YYYY-MM format.
    month: String,
}

#[utoipa::path(
    get,
    path = "/api/v1/reports/monthly",
    tag = "reports",
    security(("bearer_auth" = [])),
    params(("month" = String, Query, description = "Calendar month in YYYY-MM format")),
    responses((status = 200, body = PeriodSummary))
)]
pub(crate) async fn monthly(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Query(query): Query<MonthlyQuery>,
) -> ApiResult<Json<PeriodSummary>> {
    let month_bytes = query.month.as_bytes();
    if month_bytes.len() != 7 || month_bytes[4] != b'-' {
        return Err(ApiError::bad_request(
            "invalid_month",
            "month must use YYYY-MM format",
        ));
    }
    let date_from = NaiveDate::parse_from_str(&format!("{}-01", query.month), "%Y-%m-%d")
        .map_err(|_| ApiError::bad_request("invalid_month", "month must use YYYY-MM format"))?;
    if date_from.day() != 1 {
        return Err(ApiError::bad_request(
            "invalid_month",
            "month must use YYYY-MM format",
        ));
    }
    let date_to = date_from
        .checked_add_months(Months::new(1))
        .ok_or_else(|| ApiError::bad_request("invalid_month", "month is out of range"))?;
    Ok(Json(
        repository::summary(&state.pool, user.id, date_from, date_to).await?,
    ))
}

fn validate_range(date_from: NaiveDate, date_to: NaiveDate) -> ApiResult<()> {
    if date_from >= date_to {
        return Err(ApiError::bad_request(
            "invalid_date_range",
            "date_from must be before date_to",
        ));
    }
    Ok(())
}
