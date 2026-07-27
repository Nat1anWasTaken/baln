use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::accounts::AccountType;

#[derive(Debug, FromRow)]
pub(crate) struct ReportRow {
    pub account_id: Uuid,
    pub account_key: String,
    pub account_name: String,
    pub account_type: AccountType,
    pub ledger_total_minor: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReportAccountTotal {
    pub account_id: Uuid,
    pub account_key: String,
    pub account_name: String,
    pub account_type: AccountType,
    pub total_minor: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PeriodSummary {
    pub date_from: NaiveDate,
    pub date_to: NaiveDate,
    pub income_minor: i64,
    pub expense_minor: i64,
    pub net_minor: i64,
    pub income_accounts: Vec<ReportAccountTotal>,
    pub expense_accounts: Vec<ReportAccountTotal>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum ReportGranularity {
    Day,
    Week,
    Month,
}

impl ReportGranularity {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Day => "day",
            Self::Week => "week",
            Self::Month => "month",
        }
    }
}

#[derive(Debug, FromRow, Serialize, ToSchema)]
pub struct ReportTrendPoint {
    pub date_from: NaiveDate,
    pub date_to: NaiveDate,
    pub income_minor: i64,
    pub expense_minor: i64,
    pub net_minor: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReportTrend {
    pub date_from: NaiveDate,
    pub date_to: NaiveDate,
    pub granularity: ReportGranularity,
    pub points: Vec<ReportTrendPoint>,
}

#[derive(Debug, FromRow, Serialize, ToSchema)]
pub struct FinancialPosition {
    pub as_of: NaiveDate,
    pub asset_minor: i64,
    pub liability_minor: i64,
    pub net_worth_minor: i64,
}
