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
    reports::{FinancialPosition, PeriodSummary, ReportGranularity, ReportTrend, repository},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/summary", get(summary))
        .route("/monthly", get(monthly))
        .route("/trend", get(trend))
        .route("/position", get(position))
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

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct TrendQuery {
    date_from: NaiveDate,
    date_to: NaiveDate,
    granularity: ReportGranularity,
}

#[utoipa::path(
    get,
    path = "/api/v1/reports/trend",
    tag = "reports",
    security(("bearer_auth" = [])),
    params(TrendQuery),
    responses((status = 200, body = ReportTrend))
)]
pub(crate) async fn trend(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Query(query): Query<TrendQuery>,
) -> ApiResult<Json<ReportTrend>> {
    validate_range(query.date_from, query.date_to)?;
    validate_trend_size(query.date_from, query.date_to, query.granularity)?;
    let points = repository::trend(
        &state.pool,
        user.id,
        query.date_from,
        query.date_to,
        query.granularity,
    )
    .await?;
    Ok(Json(ReportTrend {
        date_from: query.date_from,
        date_to: query.date_to,
        granularity: query.granularity,
        points,
    }))
}

fn validate_trend_size(
    date_from: NaiveDate,
    date_to: NaiveDate,
    granularity: ReportGranularity,
) -> ApiResult<()> {
    let days = (date_to - date_from).num_days();
    let maximum_days = match granularity {
        ReportGranularity::Day => 400,
        ReportGranularity::Week => 2_800,
        ReportGranularity::Month => 12_400,
    };
    if days > maximum_days {
        return Err(ApiError::bad_request(
            "trend_range_too_large",
            "date range is too large for the requested granularity",
        ));
    }
    Ok(())
}

#[derive(Debug, Deserialize, IntoParams)]
pub(crate) struct PositionQuery {
    as_of: NaiveDate,
}

#[utoipa::path(
    get,
    path = "/api/v1/reports/position",
    tag = "reports",
    security(("bearer_auth" = [])),
    params(PositionQuery),
    responses((status = 200, body = FinancialPosition))
)]
pub(crate) async fn position(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Query(query): Query<PositionQuery>,
) -> ApiResult<Json<FinancialPosition>> {
    Ok(Json(
        repository::position(&state.pool, user.id, query.as_of).await?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trend_size_limits_match_granularity() {
        let start = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();
        assert!(
            validate_trend_size(
                start,
                start + chrono::Duration::days(400),
                ReportGranularity::Day,
            )
            .is_ok()
        );
        assert!(
            validate_trend_size(
                start,
                start + chrono::Duration::days(401),
                ReportGranularity::Day,
            )
            .is_err()
        );
        assert!(
            validate_trend_size(
                start,
                start + chrono::Duration::days(2_800),
                ReportGranularity::Week,
            )
            .is_ok()
        );
    }
}
