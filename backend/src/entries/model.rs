use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::accounts::AccountType;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize, ToSchema)]
pub struct PostingInput {
    pub account_key: String,
    pub amount_minor: i64,
    pub memo: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct CreateEntryRequest {
    pub date: NaiveDate,
    pub description: String,
    pub note: Option<String>,
    pub dedup_key: Option<String>,
    #[serde(default)]
    pub confirmed_distinct: bool,
    pub postings: Vec<PostingInput>,
}

#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct UpdateEntryRequest {
    pub date: NaiveDate,
    pub description: String,
    pub note: Option<String>,
    pub postings: Vec<PostingInput>,
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct AccountSummary {
    pub id: Uuid,
    pub key: String,
    pub name: String,
    pub r#type: AccountType,
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct PostingResponse {
    pub id: Uuid,
    pub account: AccountSummary,
    pub amount_minor: i64,
    pub memo: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct EntryResponse {
    pub id: Uuid,
    pub date: NaiveDate,
    pub description: String,
    pub note: Option<String>,
    pub dedup_key: Option<String>,
    pub postings: Vec<PostingResponse>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, ToSchema)]
pub struct PossibleDuplicateMatch {
    pub pending_entry_number: usize,
    pub existing_entries: Vec<EntryResponse>,
    pub pending_entry_numbers: Vec<usize>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct ListEntriesQuery {
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
    pub account_key: Option<String>,
    pub budget_id: Option<Uuid>,
    pub q: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct EntryPage {
    pub items: Vec<EntryResponse>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, FromRow)]
pub(crate) struct EntryRow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub date: NaiveDate,
    pub description: String,
    pub note: Option<String>,
    pub dedup_key: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
pub(crate) struct PostingRow {
    pub id: Uuid,
    pub account_id: Uuid,
    pub account_key: String,
    pub account_name: String,
    pub account_type: AccountType,
    pub amount_minor: i64,
    pub memo: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, FromRow)]
pub(crate) struct EntryPostingRow {
    pub entry_id: Uuid,
    pub id: Uuid,
    pub account_id: Uuid,
    pub account_key: String,
    pub account_name: String,
    pub account_type: AccountType,
    pub amount_minor: i64,
    pub memo: Option<String>,
    pub created_at: DateTime<Utc>,
}
