use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Type};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, ToSchema, Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "account_type", rename_all = "lowercase")]
pub enum AccountType {
    Asset,
    Liability,
    Income,
    Expense,
    Equity,
}

impl AccountType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Asset => "asset",
            Self::Liability => "liability",
            Self::Income => "income",
            Self::Expense => "expense",
            Self::Equity => "equity",
        }
    }

    pub fn normalize_balance(self, raw: i64) -> i64 {
        match self {
            Self::Asset | Self::Expense => raw,
            Self::Liability | Self::Income | Self::Equity => -raw,
        }
    }
}

#[derive(Clone, Debug, FromRow, Serialize, ToSchema)]
pub struct Account {
    pub id: Uuid,
    #[serde(skip_serializing)]
    pub user_id: Uuid,
    pub key: String,
    pub name: String,
    #[sqlx(rename = "type")]
    pub r#type: AccountType,
    pub archived: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateAccountRequest {
    pub key: String,
    pub name: String,
    pub r#type: AccountType,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateAccountRequest {
    pub name: Option<String>,
    pub archived: Option<bool>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct ListAccountsQuery {
    #[serde(default)]
    pub include_archived: bool,
    pub q: Option<String>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct BalanceQuery {
    pub as_of: Option<NaiveDate>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AccountBalance {
    pub account_id: Uuid,
    pub account_key: String,
    pub as_of: Option<NaiveDate>,
    pub ledger_balance_minor: i64,
    pub display_balance_minor: i64,
}
