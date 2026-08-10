use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Type};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::accounts::AccountType;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize, ToSchema, Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "budget_period_unit", rename_all = "lowercase")]
pub enum BudgetPeriodUnit {
    Day,
    Week,
    Month,
    Year,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RolloverEditMode {
    Recalculate,
    Preserve,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum BudgetStatusKind {
    Upcoming,
    Active,
    Overspent,
}

#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct CreateBudgetRequest {
    pub name: String,
    pub amount_minor: i64,
    pub start_date: NaiveDate,
    pub period_count: i32,
    pub period_unit: BudgetPeriodUnit,
    pub account_keys: Vec<String>,
    #[serde(default)]
    pub show_on_overview: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, ToSchema)]
pub struct UpdateBudgetRequest {
    pub name: Option<String>,
    pub amount_minor: Option<i64>,
    pub start_date: Option<NaiveDate>,
    pub period_count: Option<i32>,
    pub period_unit: Option<BudgetPeriodUnit>,
    pub account_keys: Option<Vec<String>>,
    pub show_on_overview: Option<bool>,
    pub rollover_edit_mode: Option<RolloverEditMode>,
}

#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct ReorderBudgetsRequest {
    pub budget_ids: Vec<Uuid>,
}

#[derive(Clone, Debug, Deserialize, IntoParams)]
pub struct ListBudgetsQuery {
    #[serde(default)]
    pub overview_only: bool,
}

#[derive(Clone, Debug, FromRow)]
pub(crate) struct BudgetRow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub amount_minor: i64,
    pub start_date: NaiveDate,
    pub period_count: i32,
    pub period_unit: BudgetPeriodUnit,
    pub show_on_overview: bool,
    pub overview_position: Option<i64>,
    pub rollover_anchor_date: NaiveDate,
    pub rollover_anchor_minor: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, FromRow, Serialize, ToSchema)]
pub struct BudgetAccount {
    pub id: Uuid,
    pub key: String,
    pub name: String,
    pub r#type: AccountType,
    pub archived: bool,
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct BudgetStatus {
    pub id: Uuid,
    pub name: String,
    pub amount_minor: i64,
    pub start_date: NaiveDate,
    pub period_count: i32,
    pub period_unit: BudgetPeriodUnit,
    pub accounts: Vec<BudgetAccount>,
    pub show_on_overview: bool,
    pub overview_position: Option<i64>,
    pub as_of: NaiveDate,
    pub period_from: NaiveDate,
    pub period_to: NaiveDate,
    pub carry_in_minor: i64,
    pub available_minor: i64,
    pub spent_minor: i64,
    pub remaining_minor: i64,
    pub status: BudgetStatusKind,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
