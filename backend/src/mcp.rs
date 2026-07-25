use std::{collections::HashMap, sync::Arc};

use axum::http::request::Parts;
use chrono::{DateTime, Datelike, Months, NaiveDate, Utc};
use chrono_tz::Tz;
use rmcp::{
    ErrorData, RoleServer, ServerHandler,
    handler::server::tool::schema_for_type,
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, JsonObject,
        ListToolsResult, MetaObject, PaginatedRequestParams, ServerCapabilities, ServerInfo, Tool,
        ToolAnnotations,
    },
    service::RequestContext,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    },
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    ApiError, AppState,
    accounts::{
        AccountType, CreateAccountRequest, UpdateAccountRequest, repository as account_repository,
        service as account_service,
    },
    entries::{
        CreateEntryRequest, ListEntriesQuery, PostingInput, UpdateEntryRequest,
        repository as entry_repository, service as entry_service,
    },
    oauth::OAuthPrincipal,
    reports::repository as report_repository,
};

const MAX_BATCH_ENTRIES: usize = entry_service::MAX_BATCH_ENTRIES;
const MAX_MOVEMENTS_PER_ENTRY: usize = 50;
const FOREIGN_CURRENCY_POLICY: &str = "When the user gives a non-TWD amount, automatically \
convert it to whole TWD before calling an entry creation or update tool. Prefer the actual \
settled TWD amount from a receipt, card, or bank statement. Otherwise use a reliable exchange \
rate for the transaction date, round to the nearest whole TWD, and disclose the original amount \
and currency, rate, rate date, source, and rounding. Preserve those conversion details in the \
entry note or movement memo. Ask the user only when no reliable rate is available or the intended \
rate is materially ambiguous; never guess or silently convert.";
const SERVER_INSTRUCTIONS: &str = "Baln is a private TWD double-entry ledger. Before creating an \
entry, call get_entry_creation_context unless exact active account keys are already known. Never \
invent an account key. Create entries only through create_entries, including for one entry. It \
accepts positive semantic movements from a source account to a destination account and returns \
natural-language next actions whenever more information is required. When a user supplies a non-TWD amount, automatically convert it under the foreign-currency \
policy returned by get_entry_creation_context before writing the entry. For each distinct create \
operation, generate a new UUID v4 or v7 operation_key and retain it for retries; reuse a key only \
for the exact same operation. Baln checks new entries for matching dates, accounts, and amounts. \
When it reports a possible duplicate, ask whether the pending entry is separate and set \
confirmed_distinct only after explicit user confirmation. Updates and deletions are available only \
through the plural update_entries and delete_entries tools, including for one entry. Retrieve and \
identify every exact target first. Both tools are atomic: if any batch item is invalid or missing, \
no entries in that batch are changed.";

fn foreign_currency_policy() -> Value {
    json!({
        "behavior": "convert_automatically_when_reliable",
        "preferred_twd_source": "actual settled TWD amount from a receipt, card, or bank statement",
        "fallback_rate": "reliable exchange rate for the transaction date",
        "rounding": "nearest whole TWD",
        "disclose": [
            "original amount and currency",
            "exchange rate",
            "rate date",
            "rate source",
            "rounding"
        ],
        "preserve_in": "entry note or movement memo",
        "ask_user_when": "no reliable rate is available or the intended rate is materially ambiguous",
        "prohibited": "guessing or silently converting"
    })
}

pub type McpHttpService = StreamableHttpService<BalnMcp, LocalSessionManager>;

pub fn streamable_http_service(state: AppState) -> McpHttpService {
    let public_url = url::Url::parse(&state.config.public_base_url).ok();
    let public_host = public_url
        .as_ref()
        .and_then(url::Url::host_str)
        .unwrap_or("localhost")
        .to_owned();
    let mut allowed_hosts = vec![public_host, "localhost".to_owned(), "127.0.0.1".to_owned()];
    allowed_hosts.sort();
    allowed_hosts.dedup();
    let allowed_origins = vec![
        state.config.frontend_origin.clone(),
        "https://chatgpt.com".to_owned(),
        "https://chat.openai.com".to_owned(),
    ];
    let service_state = state.clone();
    StreamableHttpService::new(
        move || Ok(BalnMcp::new(service_state.clone())),
        Default::default(),
        StreamableHttpServerConfig::default()
            .with_legacy_session_mode(false)
            .with_json_response(true)
            .with_sse_keep_alive(None)
            .with_allowed_hosts(allowed_hosts)
            .with_allowed_origins(allowed_origins)
            .with_max_request_body_bytes(1024 * 1024),
    )
}

#[derive(Clone)]
pub struct BalnMcp {
    state: AppState,
    tools: Arc<Vec<Tool>>,
}

impl BalnMcp {
    fn new(state: AppState) -> Self {
        Self {
            state,
            tools: Arc::new(build_tools()),
        }
    }

    async fn execute(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        let Some(principal) = principal(&context) else {
            return action_error(
                "error",
                "Baln could not identify the authorized user for this request.",
                "Reconnect Baln in ChatGPT, then retry the request.",
                Vec::new(),
                json!({"code": "missing_authorization_context"}),
            );
        };
        let arguments = Value::Object(request.arguments.unwrap_or_default());
        match request.name.as_ref() {
            "get_entry_creation_context" => {
                if let Err(result) = self.require(&principal, "ledger:read") {
                    result
                } else {
                    self.entry_creation_context(&principal).await
                }
            }
            "list_accounts" => {
                self.read_tool::<ListAccountsInput, _, _>(
                    &principal,
                    arguments,
                    |input| async move {
                        let accounts = account_repository::list(
                            &self.state.pool,
                            principal.user.id,
                            input.include_archived,
                            clean(input.query.as_deref()),
                        )
                        .await?;
                        let summary = if accounts.is_empty() {
                            "No accounts matched. No action is required unless you expected an account; use a broader query or ask the user how the account should be named.".to_owned()
                        } else {
                            format!(
                                "Found {} account{}. Use the exact account key when creating an entry.",
                                accounts.len(),
                                if accounts.len() == 1 { "" } else { "s" }
                            )
                        };
                        Ok(success(summary, json!({"accounts": accounts})))
                    },
                )
                .await
            }
            "get_account" => {
                self.read_tool::<AccountIdInput, _, _>(&principal, arguments, |input| async move {
                    let account = account_repository::get(
                        &self.state.pool,
                        principal.user.id,
                        input.account_id,
                    )
                    .await?
                    .ok_or_else(|| ApiError::not_found("account"))?;
                    Ok(success(
                        format!("Found account “{}” with key {}.", account.name, account.key),
                        json!({"account": account}),
                    ))
                })
                .await
            }
            "get_account_balance" => {
                self.read_tool::<AccountBalanceInput, _, _>(
                    &principal,
                    arguments,
                    |input| async move {
                        let balance = account_service::balance(
                            &self.state.pool,
                            principal.user.id,
                            input.account_id,
                            input.as_of,
                        )
                        .await?;
                        let when = input
                            .as_of
                            .map(|date| format!(" as of {date}"))
                            .unwrap_or_default();
                        Ok(success(
                            format!(
                                "The display balance for {}{} is TWD {}.",
                                balance.account_key, when, balance.display_balance_minor
                            ),
                            json!({"balance": balance, "currency": "TWD"}),
                        ))
                    },
                )
                .await
            }
            "list_entries" => {
                self.read_tool::<ListEntriesInput, _, _>(
                    &principal,
                    arguments,
                    |input| async move {
                        let page = entry_service::list(
                            &self.state.pool,
                            principal.user.id,
                            ListEntriesQuery {
                                date_from: input.date_from,
                                date_to: input.date_to,
                                account_key: input.account_key,
                                q: input.query,
                                cursor: input.cursor,
                                limit: input.limit,
                            },
                        )
                        .await?;
                        let summary = if page.items.is_empty() {
                            "No ledger entries matched these filters. No action is required unless the user expected results; if so, broaden the dates or search text.".to_owned()
                        } else {
                            format!(
                                "Found {} ledger entr{}. A next cursor is included when more results are available.",
                                page.items.len(),
                                if page.items.len() == 1 { "y" } else { "ies" }
                            )
                        };
                        Ok(success(summary, json!({"page": page})))
                    },
                )
                .await
            }
            "get_entry" => {
                self.read_tool::<EntryIdInput, _, _>(&principal, arguments, |input| async move {
                    let entry = entry_repository::get(
                        &self.state.pool,
                        principal.user.id,
                        input.entry_id,
                    )
                    .await?
                    .ok_or_else(|| ApiError::not_found("entry"))?;
                    Ok(success(
                        format!(
                            "Found “{}” dated {} with {} postings.",
                            entry.description,
                            entry.date,
                            entry.postings.len()
                        ),
                        json!({"entry": entry}),
                    ))
                })
                .await
            }
            "get_period_summary" => {
                self.read_tool::<PeriodSummaryInput, _, _>(
                    &principal,
                    arguments,
                    |input| async move {
                        if input.date_from >= input.date_to {
                            return Err(ApiError::bad_request(
                                "invalid_date_range",
                                "date_from must be before date_to; date_to is exclusive",
                            ));
                        }
                        let report = report_repository::summary(
                            &self.state.pool,
                            principal.user.id,
                            input.date_from,
                            input.date_to,
                        )
                        .await?;
                        Ok(success(
                            format!(
                                "From {} through the day before {}, income was TWD {}, expenses were TWD {}, and net income was TWD {}.",
                                report.date_from,
                                report.date_to,
                                report.income_minor,
                                report.expense_minor,
                                report.net_minor
                            ),
                            json!({"summary": report, "currency": "TWD"}),
                        ))
                    },
                )
                .await
            }
            "get_monthly_summary" => {
                self.read_tool::<MonthlySummaryInput, _, _>(
                    &principal,
                    arguments,
                    |input| async move {
                        let date_from = parse_month(&input.month)?;
                        let date_to =
                            date_from.checked_add_months(Months::new(1)).ok_or_else(|| {
                                ApiError::bad_request("invalid_month", "month is out of range")
                            })?;
                        let report = report_repository::summary(
                            &self.state.pool,
                            principal.user.id,
                            date_from,
                            date_to,
                        )
                        .await?;
                        Ok(success(
                            format!(
                                "For {}, income was TWD {}, expenses were TWD {}, and net income was TWD {}.",
                                input.month,
                                report.income_minor,
                                report.expense_minor,
                                report.net_minor
                            ),
                            json!({"summary": report, "month": input.month, "currency": "TWD"}),
                        ))
                    },
                )
                .await
            }
            "create_entries" => {
                if let Err(result) = self.require(&principal, "ledger:write") {
                    result
                } else {
                    match parse_input::<CreateEntriesInput>(arguments) {
                        Ok(input) => {
                            let operation =
                                operation_identity(&context, input.operation_key.as_ref());
                            self.create_entries(
                                principal,
                                input.entries,
                                operation,
                            )
                            .await
                        }
                        Err(result) => result,
                    }
                }
            }
            "update_entries" => {
                if let Err(result) = self.require(&principal, "ledger:write") {
                    result
                } else {
                    match parse_input::<UpdateEntriesInput>(arguments) {
                        Ok(input) => self.update_entries(principal, input.entries).await,
                        Err(result) => result,
                    }
                }
            }
            "create_account" => {
                if let Err(result) = self.require(&principal, "ledger:write") {
                    result
                } else {
                    match parse_input::<CreateAccountInput>(arguments) {
                        Ok(input) => match parse_account_type(&input.account_type) {
                            Ok(account_type) => match account_service::create(
                                &self.state.pool,
                                principal.user.id,
                                CreateAccountRequest {
                                    key: input.key,
                                    name: input.name,
                                    r#type: account_type,
                                },
                            )
                            .await
                            {
                                Ok(account) => success(
                                    format!(
                                        "Created account “{}” with key {}. It is ready for ledger entries.",
                                        account.name, account.key
                                    ),
                                    json!({"account": account}),
                                ),
                                Err(error) => api_error(error),
                            },
                            Err(result) => result,
                        },
                        Err(result) => result,
                    }
                }
            }
            "update_account" => {
                if let Err(result) = self.require(&principal, "ledger:write") {
                    result
                } else {
                    match parse_input::<UpdateAccountInput>(arguments) {
                        Ok(input) => match account_service::update(
                            &self.state.pool,
                            principal.user.id,
                            input.account_id,
                            UpdateAccountRequest {
                                name: input.name,
                                archived: input.archived,
                            },
                        )
                        .await
                        {
                            Ok(account) => success(
                                format!(
                                    "Updated account “{}” ({}). No further action is required.",
                                    account.name, account.key
                                ),
                                json!({"account": account}),
                            ),
                            Err(error) => api_error(error),
                        },
                        Err(result) => result,
                    }
                }
            }
            "delete_account" => {
                if let Err(result) = self.require(&principal, "ledger:delete") {
                    result
                } else {
                    match parse_input::<AccountIdInput>(arguments) {
                        Ok(input) => match account_service::delete(
                            &self.state.pool,
                            principal.user.id,
                            input.account_id,
                        )
                        .await
                        {
                            Ok(()) => success(
                                format!(
                                    "Deleted account {}. This action cannot be undone through Baln.",
                                    input.account_id
                                ),
                                json!({"deleted_account_id": input.account_id}),
                            ),
                            Err(error) => api_error(error),
                        },
                        Err(result) => result,
                    }
                }
            }
            "delete_entries" => {
                if let Err(result) = self.require(&principal, "ledger:delete") {
                    result
                } else {
                    match parse_input::<DeleteEntriesInput>(arguments) {
                        Ok(input) => match entry_service::delete_batch(
                            &self.state.pool,
                            principal.user.id,
                            input.entry_ids,
                        )
                        .await
                        {
                            Ok(entry_ids) => success(
                                format!(
                                    "Deleted {} ledger entries atomically. This action cannot be undone through Baln.",
                                    entry_ids.len()
                                ),
                                json!({
                                    "atomic": true,
                                    "deleted_count": entry_ids.len(),
                                    "deleted_entry_ids": entry_ids
                                }),
                            ),
                            Err(error) => {
                                atomic_operation_api_error(error, "deleted", "deleted_count")
                            }
                        },
                        Err(result) => result,
                    }
                }
            }
            _ => action_error(
                "error",
                format!("Baln does not provide a tool named “{}”.", request.name),
                "Call tools/list and choose one of the available Baln tools.",
                Vec::new(),
                json!({"code": "unknown_tool"}),
            ),
        }
    }

    fn require(&self, principal: &OAuthPrincipal, scope: &str) -> Result<(), CallToolResult> {
        principal.require_scope(scope).map_err(|_| {
            let mut result = action_error(
                "error",
                format!("The Baln connection does not have the required “{scope}” permission."),
                "Reconnect Baln in ChatGPT and approve the required permission, then retry.",
                Vec::new(),
                json!({
                    "code": "insufficient_scope",
                    "required_scope": scope
                }),
            );
            let resource_metadata = format!(
                "{}/.well-known/oauth-protected-resource/mcp",
                self.state.config.public_base_url
            );
            let mut meta = JsonObject::new();
            meta.insert(
                "mcp/www_authenticate".to_owned(),
                json!([format!(
                    "Bearer resource_metadata=\"{resource_metadata}\", scope=\"{scope}\""
                )]),
            );
            result.meta = Some(MetaObject(meta));
            result
        })
    }

    async fn read_tool<I, F, Fut>(
        &self,
        principal: &OAuthPrincipal,
        arguments: Value,
        operation: F,
    ) -> CallToolResult
    where
        I: DeserializeOwned,
        F: FnOnce(I) -> Fut,
        Fut: std::future::Future<Output = Result<CallToolResult, ApiError>>,
    {
        if let Err(result) = self.require(principal, "ledger:read") {
            return result;
        }
        let input = match parse_input::<I>(arguments) {
            Ok(input) => input,
            Err(result) => return result,
        };
        match operation(input).await {
            Ok(result) => result,
            Err(error) => api_error(error),
        }
    }

    async fn entry_creation_context(&self, principal: &OAuthPrincipal) -> CallToolResult {
        let accounts = match account_repository::list(
            &self.state.pool,
            principal.user.id,
            false,
            None,
        )
        .await
        {
            Ok(accounts) => accounts,
            Err(error) => return api_error(error),
        };
        let today = bookkeeping_date(Utc::now(), self.state.config.bookkeeping_timezone);
        let mut grouped: HashMap<&str, Vec<Value>> = HashMap::new();
        for account in &accounts {
            grouped
                .entry(account.r#type.as_str())
                .or_default()
                .push(json!({
                    "key": account.key,
                    "name": account.name,
                    "type": account.r#type
                }));
        }
        let account_lines = accounts
            .iter()
            .map(|account| {
                format!(
                    "- {}: {} ({})",
                    account.key,
                    account.name,
                    account.r#type.as_str()
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        if accounts.is_empty() {
            return action_error(
                "needs_user_input",
                format!(
                    "Baln records whole TWD amounts, and today’s bookkeeping date is {today} in {}. \
                     There are no active accounts, so an entry cannot be created yet. \
                     {FOREIGN_CURRENCY_POLICY}",
                    self.state.config.bookkeeping_timezone,
                ),
                "Ask the user which source, destination, income, or expense accounts they want. Create only the accounts they approve, then call get_entry_creation_context again.",
                vec![
                    "Which accounts would you like to create for the source of money and its destination or category?".to_owned(),
                ],
                json!({
                    "code": "no_active_accounts",
                    "bookkeeping_date": today,
                    "timezone": self.state.config.bookkeeping_timezone.to_string(),
                    "currency": "TWD",
                    "foreign_currency_policy": foreign_currency_policy(),
                    "accounts_by_type": grouped
                }),
            );
        }
        let summary = format!(
            "Baln records whole TWD amounts. Today’s bookkeeping date is {today} in {}. \
             {FOREIGN_CURRENCY_POLICY} Move money from the payment or source account to the \
             destination account. For an expense, move from an asset or liability account to an \
             expense account; for income, move from an income account to an asset account; for a \
             transfer, move from the source asset to the destination asset; for a refund, move from \
             the expense account back to the asset or liability account. Use these exact active \
             account keys:\n{account_lines}",
            self.state.config.bookkeeping_timezone
        );
        success(
            summary,
            json!({
                "bookkeeping_date": today,
                "timezone": self.state.config.bookkeeping_timezone.to_string(),
                "currency": "TWD",
                "amount_rule": "positive whole TWD",
                "foreign_currency_policy": foreign_currency_policy(),
                "accounts_by_type": grouped,
                "examples": [
                    {"kind": "expense", "direction": "payment account → expense account"},
                    {"kind": "income", "direction": "income account → receiving asset account"},
                    {"kind": "transfer", "direction": "source asset account → destination asset account"},
                    {"kind": "credit card payment", "direction": "bank asset account → credit-card liability account"},
                    {"kind": "refund", "direction": "expense account → refunded asset or liability account"}
                ]
            }),
        )
    }

    async fn create_entries(
        &self,
        principal: OAuthPrincipal,
        drafts: Vec<EntryDraft>,
        operation: OperationIdentity,
    ) -> CallToolResult {
        if drafts.is_empty() || drafts.len() > MAX_BATCH_ENTRIES {
            return action_error(
                "needs_agent_action",
                format!(
                    "No entries were created. A batch must contain between 1 and {MAX_BATCH_ENTRIES} entries."
                ),
                format!(
                    "Split the request into batches of at most {MAX_BATCH_ENTRIES} entries, then retry."
                ),
                Vec::new(),
                json!({"code": "invalid_batch_size", "created_count": 0, "atomic": true}),
            );
        }
        let default_date = bookkeeping_date(Utc::now(), self.state.config.bookkeeping_timezone);
        let accounts =
            match account_repository::list(&self.state.pool, principal.user.id, true, None).await {
                Ok(accounts) => accounts,
                Err(error) => return api_error(error),
            };
        let account_map: HashMap<_, _> = accounts
            .iter()
            .map(|account| (account.key.as_str(), account))
            .collect();
        let mut errors = Vec::new();
        for (entry_index, draft) in drafts.iter().enumerate() {
            validate_draft(entry_index, draft, &account_map, &accounts, &mut errors);
        }
        if !errors.is_empty() {
            let first = &errors[0];
            let subject = drafts
                .get(first.entry_number.saturating_sub(1))
                .map(|entry| entry.description.trim())
                .filter(|value| !value.is_empty())
                .map(|value| format!(", “{value},”"))
                .unwrap_or_default();
            let next_action = if errors
                .iter()
                .any(|error| matches!(error.code.as_str(), "unknown_account" | "archived_account"))
            {
                "Call get_entry_creation_context to review active account keys. If the intended account is still unclear, ask the user which account or category they mean, then retry the complete batch."
            } else {
                "Correct the listed information. If the intended value is not available from the conversation, ask the user the suggested question, then retry the complete batch."
            };
            let questions = errors
                .iter()
                .filter_map(|error| error.question_for_user.clone())
                .collect::<Vec<_>>();
            return action_error(
                if questions.is_empty() {
                    "needs_agent_action"
                } else {
                    "needs_user_input"
                },
                format!(
                    "No entries were created. Entry {}{} has a problem: {}",
                    first.entry_number, subject, first.message
                ),
                next_action,
                questions,
                json!({
                    "code": "batch_validation_failed",
                    "atomic": true,
                    "created_count": 0,
                    "errors": errors
                }),
            );
        }
        let requests = drafts
            .iter()
            .enumerate()
            .map(|(entry_index, draft)| CreateEntryRequest {
                date: draft.date.unwrap_or(default_date),
                description: draft.description.trim().to_owned(),
                note: draft.note.clone(),
                dedup_key: Some(idempotency_key(
                    principal.grant_id,
                    "create_entries",
                    &operation,
                    entry_index,
                )),
                confirmed_distinct: draft.confirmed_distinct,
                postings: postings_from_movements(&draft.movements),
            })
            .collect();
        let results = match entry_service::create_batch(
            &self.state.pool,
            principal.user.id,
            requests,
        )
        .await
        {
            Ok(results) => results,
            Err(error) => return atomic_api_error(error),
        };
        let items = results
            .iter()
            .zip(drafts.iter())
            .map(|((entry, replayed), draft)| {
                json!({
                    "id": entry.id,
                    "date": entry.date,
                    "description": entry.description,
                    "movements": draft.movements,
                    "replayed": replayed
                })
            })
            .collect::<Vec<_>>();
        let created_count = results.iter().filter(|(_, replayed)| !replayed).count();
        let replayed_count = results.len() - created_count;
        let summary = if results.len() == 1 {
            let ((entry, replayed), draft) =
                results.first().zip(drafts.first()).expect("one entry");
            let total: i64 = draft
                .movements
                .iter()
                .map(|movement| movement.amount_minor)
                .sum();
            if *replayed {
                format!(
                    "The exact request was already saved as “{}” for TWD {} on {}. No duplicate was created and no further action is required.",
                    entry.description, total, entry.date
                )
            } else {
                format!(
                    "Created “{}” for TWD {} on {}. No further action is required.",
                    entry.description, total, entry.date
                )
            }
        } else {
            format!(
                "Saved {} ledger entries atomically: {} newly created and {} safely replayed. No further action is required.",
                results.len(),
                created_count,
                replayed_count
            )
        };
        success(
            summary,
            json!({
                "atomic": true,
                "default_date": default_date,
                "created_count": created_count,
                "replayed_count": replayed_count,
                "entries": items
            }),
        )
    }

    async fn update_entries(
        &self,
        principal: OAuthPrincipal,
        inputs: Vec<UpdateEntryInput>,
    ) -> CallToolResult {
        if inputs.is_empty() || inputs.len() > MAX_BATCH_ENTRIES {
            return action_error(
                "needs_agent_action",
                format!(
                    "No entries were updated. A batch must contain between 1 and {MAX_BATCH_ENTRIES} entries."
                ),
                format!(
                    "Split the request into batches of at most {MAX_BATCH_ENTRIES} entries, then retry."
                ),
                Vec::new(),
                json!({
                    "code": "invalid_batch_size",
                    "atomic": true,
                    "updated_count": 0
                }),
            );
        }
        let unique_ids = inputs
            .iter()
            .map(|input| input.entry_id)
            .collect::<std::collections::HashSet<_>>();
        if unique_ids.len() != inputs.len() {
            return action_error(
                "needs_agent_action",
                "No entries were updated. Every entry_id in the batch must be distinct.",
                "Remove duplicate entry IDs, then retry the complete batch.",
                Vec::new(),
                json!({
                    "code": "duplicate_batch_entry_id",
                    "atomic": true,
                    "updated_count": 0
                }),
            );
        }

        let accounts =
            match account_repository::list(&self.state.pool, principal.user.id, true, None).await {
                Ok(accounts) => accounts,
                Err(error) => return api_error(error),
            };
        let account_map: HashMap<_, _> = accounts
            .iter()
            .map(|account| (account.key.as_str(), account))
            .collect();
        let mut errors = Vec::new();
        for (entry_index, input) in inputs.iter().enumerate() {
            let draft = EntryDraft {
                date: input.date,
                description: input.description.clone(),
                note: input.note.clone(),
                movements: input.movements.clone(),
                confirmed_distinct: false,
            };
            validate_draft(entry_index, &draft, &account_map, &accounts, &mut errors);
        }
        if !errors.is_empty() {
            return action_error(
                "needs_agent_action",
                format!(
                    "No entries were updated. Entry {} has a problem: {}",
                    errors[0].entry_number, errors[0].message
                ),
                "Review the listed fields or call get_entry_creation_context for current account keys, then retry the complete batch.",
                errors
                    .iter()
                    .filter_map(|error| error.question_for_user.clone())
                    .collect(),
                json!({
                    "code": "batch_validation_failed",
                    "atomic": true,
                    "updated_count": 0,
                    "errors": errors
                }),
            );
        }
        let default_date = bookkeeping_date(Utc::now(), self.state.config.bookkeeping_timezone);
        let requests = inputs
            .iter()
            .map(|input| {
                (
                    input.entry_id,
                    UpdateEntryRequest {
                        date: input.date.unwrap_or(default_date),
                        description: input.description.trim().to_owned(),
                        note: input.note.clone(),
                        postings: postings_from_movements(&input.movements),
                    },
                )
            })
            .collect();
        match entry_service::update_batch(&self.state.pool, principal.user.id, requests).await {
            Ok(entries) => {
                let items = entries
                    .into_iter()
                    .zip(inputs)
                    .map(|(entry, input)| {
                        json!({
                            "id": entry.id,
                            "date": entry.date,
                            "description": entry.description,
                            "movements": input.movements
                        })
                    })
                    .collect::<Vec<_>>();
                success(
                    format!(
                        "Updated {} ledger entries atomically. No further action is required.",
                        items.len()
                    ),
                    json!({
                        "atomic": true,
                        "default_date": default_date,
                        "updated_count": items.len(),
                        "entries": items
                    }),
                )
            }
            Err(error) => atomic_operation_api_error(error, "updated", "updated_count"),
        }
    }
}

impl ServerHandler for BalnMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_instructions(SERVER_INSTRUCTIONS)
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult::with_all_items(self.tools.as_ref().clone()))
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        self.tools.iter().find(|tool| tool.name == name).cloned()
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        Ok(self.execute(request, context).await.into())
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct EmptyInput {}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct ListAccountsInput {
    /// Include archived accounts. Omit or use false when selecting accounts for a new entry.
    #[serde(default)]
    include_archived: bool,
    /// Optional text matched against account keys and names.
    query: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct AccountIdInput {
    /// The exact Baln account UUID returned by an account tool.
    account_id: Uuid,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct AccountBalanceInput {
    /// The exact Baln account UUID returned by an account tool.
    account_id: Uuid,
    /// Optional inclusive balance date in YYYY-MM-DD. Omit for the current balance.
    as_of: Option<NaiveDate>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct ListEntriesInput {
    /// Optional inclusive first date in YYYY-MM-DD.
    date_from: Option<NaiveDate>,
    /// Optional exclusive end date in YYYY-MM-DD.
    date_to: Option<NaiveDate>,
    /// Optional exact account key.
    account_key: Option<String>,
    /// Optional natural-language text matched against descriptions, notes, memos, and account names.
    query: Option<String>,
    /// Opaque cursor returned by a previous call.
    cursor: Option<String>,
    /// Number of entries to return, from 1 through 200. Defaults to 50.
    limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct EntryIdInput {
    /// The exact Baln entry UUID returned by an entry tool.
    entry_id: Uuid,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct PeriodSummaryInput {
    /// Inclusive first date in YYYY-MM-DD.
    date_from: NaiveDate,
    /// Exclusive end date in YYYY-MM-DD.
    date_to: NaiveDate,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct MonthlySummaryInput {
    /// Calendar month in YYYY-MM format.
    month: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct MovementInput {
    /// Exact active account key where the money comes from.
    from_account_key: String,
    /// Exact active account key where the money goes.
    to_account_key: String,
    /// Positive whole-TWD amount. For a non-TWD source amount, automatically convert it under the
    /// foreign-currency policy from get_entry_creation_context, round to whole TWD, and preserve
    /// the disclosed conversion details in the entry note or movement memo. Do not use a negative
    /// or signed debit/credit amount.
    amount_minor: i64,
    /// Optional explanation for this movement.
    memo: Option<String>,
}

#[derive(Clone, Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct EntryDraft {
    /// Bookkeeping date in YYYY-MM-DD. Omit to use today in Baln's configured timezone.
    date: Option<NaiveDate>,
    /// Short user-facing description, such as “Lunch” or “July salary”.
    description: String,
    /// Optional note applying to the whole entry. For a foreign-currency transaction, preserve the
    /// original amount and currency, exchange rate, rate date, source, and rounding here or in the
    /// movement memo.
    note: Option<String>,
    /// One or more positive money movements. Use multiple movements for splits.
    movements: Vec<MovementInput>,
    /// Set this to true only after Baln reports a possible duplicate for this exact draft and the
    /// user explicitly confirms that it is a separate transaction.
    #[serde(default)]
    confirmed_distinct: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct CreateEntriesInput {
    /// Stable caller-generated UUID for this complete atomic batch. Generate a new UUID v4 or v7
    /// for every distinct batch, even when its content is identical; for example,
    /// 9b6cc2cc-1173-4dab-8f1d-2e456d698b98. Reuse the exact same UUID only when retrying the same
    /// batch, including after reconnects. Reusing it with different content returns an idempotency
    /// conflict. Omit only when the batch does not need retry protection.
    operation_key: Option<Uuid>,
    /// Complete atomic batch containing 1 through 100 entries.
    entries: Vec<EntryDraft>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct UpdateEntryInput {
    /// Exact entry UUID to update.
    entry_id: Uuid,
    /// Bookkeeping date in YYYY-MM-DD. Omit to use today in Baln's configured timezone.
    date: Option<NaiveDate>,
    /// Replacement description.
    description: String,
    /// Replacement note, or null to remove it.
    note: Option<String>,
    /// Complete replacement list of positive money movements.
    movements: Vec<MovementInput>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct UpdateEntriesInput {
    /// Complete atomic batch containing 1 through 100 replacement entries. Every entry_id must be
    /// distinct. If any item is invalid or missing, no entries are updated.
    entries: Vec<UpdateEntryInput>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct DeleteEntriesInput {
    /// Complete atomic batch of 1 through 100 distinct exact entry UUIDs. If any ID is missing, no
    /// entries are deleted.
    entry_ids: Vec<Uuid>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct CreateAccountInput {
    /// Stable snake_case key with the type prefix, for example expense.transport.
    key: String,
    /// User-facing account name.
    name: String,
    /// One of asset, liability, income, expense, or equity.
    account_type: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct UpdateAccountInput {
    /// Exact Baln account UUID.
    account_id: Uuid,
    /// New user-facing name, if it should change.
    name: Option<String>,
    /// Set true to archive or false to restore the account.
    archived: Option<bool>,
}

#[derive(Debug, Serialize)]
struct EntryValidationError {
    entry_number: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    movement_number: Option<usize>,
    field: String,
    code: String,
    message: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    suggested_account_keys: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    question_for_user: Option<String>,
}

fn build_tools() -> Vec<Tool> {
    vec![
        read_tool::<EmptyInput>(
            "get_entry_creation_context",
            "Get Entry Creation Context",
            "Call this before creating entries unless you already know every exact active account key. It explains Baln’s whole-TWD movement model, foreign-currency automatic-conversion policy, today’s bookkeeping date, active accounts, and common transaction directions. If an intended account is still unclear after this call, ask the user which listed account they mean.",
        ),
        read_tool::<ListAccountsInput>(
            "list_accounts",
            "List Accounts",
            "Find Baln accounts by key or name. Use active accounts for new entries. The response explains empty results and returns exact keys and IDs for later calls.",
        ),
        read_tool::<AccountIdInput>(
            "get_account",
            "Get Account",
            "Get one account by an exact UUID previously returned by Baln.",
        ),
        read_tool::<AccountBalanceInput>(
            "get_account_balance",
            "Get Account Balance",
            "Get the user-facing balance for one account now or on an inclusive historical date.",
        ),
        read_tool::<ListEntriesInput>(
            "list_entries",
            "List Ledger Entries",
            "Search ledger entries using optional dates, an account key, or natural-language text. date_to is exclusive. Reuse the returned cursor to continue.",
        ),
        read_tool::<EntryIdInput>(
            "get_entry",
            "Get Ledger Entry",
            "Get one complete ledger entry by an exact UUID previously returned by Baln.",
        ),
        read_tool::<PeriodSummaryInput>(
            "get_period_summary",
            "Get Period Summary",
            "Summarize income, expenses, and net income from date_from through the day before date_to.",
        ),
        read_tool::<MonthlySummaryInput>(
            "get_monthly_summary",
            "Get Monthly Summary",
            "Summarize income, expenses, and net income for one YYYY-MM calendar month.",
        ),
        write_tool::<CreateEntriesInput>(
            "create_entries",
            "Create Ledger Entries",
            "Create 1–100 balanced entries atomically, including a one-item batch for a single entry. Use descriptions and positive semantic movements from source accounts to destination accounts; dates default to today. Generate one new UUID v4 or v7 operation_key for each distinct complete batch and reuse it only to retry that same batch, including after reconnects; the same UUID with changed content is a conflict. Baln checks dates, accounts, and amounts against existing entries. If it reports a possible duplicate, ask the user whether each flagged item is a separate transaction; retry the complete batch with the same operation_key and confirmed_distinct=true only on entries the user explicitly confirms. Convert non-TWD source amounts automatically under the foreign-currency policy from get_entry_creation_context before calling this tool, and preserve the disclosed conversion details in the note or memo. Do not send signed postings, totals, IDs, or database deduplication keys. Every item is validated before insertion; if any item is invalid or conflicts, none are created and the response explains how to repair the complete batch. If an account key is unknown, call get_entry_creation_context first; if user intent remains ambiguous, ask the user before calling this tool.",
            false,
        ),
        write_tool::<UpdateEntriesInput>(
            "update_entries",
            "Update Ledger Entries",
            "Atomically replace 1–100 existing entries using exact distinct entry UUIDs and complete descriptions, dates, notes, and semantic movement lists. The whole batch is validated before writing; if any item is invalid or missing, no entries are updated. Apply the same foreign-currency automatic-conversion and disclosure policy as create_entries. Retrieve entries first when the user has not supplied their exact IDs or current meaning.",
            false,
        ),
        write_tool::<CreateAccountInput>(
            "create_account",
            "Create Account",
            "Create an account only when the user clearly intends to add one. Do not create an account merely to repair an unknown entry account key; first show or ask about existing accounts.",
            false,
        ),
        write_tool::<UpdateAccountInput>(
            "update_account",
            "Update Account",
            "Rename, archive, or restore an account. At least one of name or archived must be supplied.",
            false,
        ),
        destructive_tool::<DeleteEntriesInput>(
            "delete_entries",
            "Delete Ledger Entries",
            "Permanently delete 1–100 ledger entries atomically using distinct exact UUIDs. If any ID is missing, none are deleted. Retrieve and identify every entry before deletion when the user’s targets are not already unambiguous.",
        ),
        destructive_tool::<AccountIdInput>(
            "delete_account",
            "Delete Account",
            "Permanently delete an unused account by exact UUID. Retrieve and identify the account first. Accounts referenced by ledger entries cannot be deleted and must be archived instead.",
        ),
    ]
}

fn read_tool<I: JsonSchema + 'static>(
    name: &'static str,
    title: &str,
    description: &'static str,
) -> Tool {
    tool::<I>(name, title, description, "ledger:read").with_annotations(
        ToolAnnotations::with_title(title)
            .read_only(true)
            .destructive(false)
            .idempotent(true)
            .open_world(false),
    )
}

fn write_tool<I: JsonSchema + 'static>(
    name: &'static str,
    title: &str,
    description: &'static str,
    destructive: bool,
) -> Tool {
    tool::<I>(name, title, description, "ledger:write").with_annotations(
        ToolAnnotations::with_title(title)
            .read_only(false)
            .destructive(destructive)
            .idempotent(true)
            .open_world(false),
    )
}

fn destructive_tool<I: JsonSchema + 'static>(
    name: &'static str,
    title: &str,
    description: &'static str,
) -> Tool {
    tool::<I>(name, title, description, "ledger:delete").with_annotations(
        ToolAnnotations::with_title(title)
            .read_only(false)
            .destructive(true)
            .idempotent(true)
            .open_world(false),
    )
}

fn tool<I: JsonSchema + 'static>(
    name: &'static str,
    title: &str,
    description: &'static str,
    scope: &'static str,
) -> Tool {
    let mut meta = JsonObject::new();
    meta.insert(
        "securitySchemes".to_owned(),
        json!([{"type": "oauth2", "scopes": [scope]}]),
    );
    Tool::new(name, description, schema_for_type::<I>())
        .with_title(title)
        .with_meta(MetaObject(meta))
}

fn principal(context: &RequestContext<RoleServer>) -> Option<OAuthPrincipal> {
    context
        .extensions
        .get::<Parts>()
        .and_then(|parts| parts.extensions.get::<OAuthPrincipal>())
        .cloned()
}

fn request_id(context: &RequestContext<RoleServer>) -> String {
    serde_json::to_string(&context.id).unwrap_or_else(|_| "unknown".to_owned())
}

#[derive(Debug, PartialEq, Eq)]
enum OperationIdentity {
    Explicit(Uuid),
    Automatic {
        session_id: Option<String>,
        request_id: String,
        nonce: Uuid,
    },
}

fn operation_identity(
    context: &RequestContext<RoleServer>,
    explicit_key: Option<&Uuid>,
) -> OperationIdentity {
    if let Some(key) = explicit_key {
        return OperationIdentity::Explicit(*key);
    }

    let session_id = context
        .extensions
        .get::<Parts>()
        .and_then(|parts| parts.headers.get("mcp-session-id"))
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty());
    // Session and JSON-RPC request IDs provide useful transport scoping but cannot distinguish a
    // later operation that legitimately reuses them. The per-invocation nonce prevents false
    // collisions in that case and in sessionless transports. Callers that need durable replay
    // semantics must supply operation_key.
    OperationIdentity::Automatic {
        session_id: session_id.map(str::to_owned),
        request_id: request_id(context),
        nonce: Uuid::now_v7(),
    }
}

fn parse_input<T: DeserializeOwned>(value: Value) -> Result<T, CallToolResult> {
    serde_json::from_value(value).map_err(|error| {
        action_error(
            "needs_agent_action",
            format!("Baln could not understand the tool input: {error}."),
            "Correct the named field using the tool’s input description. If the missing value depends on the user’s intent, ask the user for it, then retry.",
            vec![
                "Please provide the missing or unclear transaction information requested by Baln."
                    .to_owned(),
            ],
            json!({"code": "invalid_tool_input", "detail": error.to_string()}),
        )
    })
}

fn validate_draft(
    entry_index: usize,
    draft: &EntryDraft,
    account_map: &HashMap<&str, &crate::accounts::Account>,
    accounts: &[crate::accounts::Account],
    errors: &mut Vec<EntryValidationError>,
) {
    let entry_number = entry_index + 1;
    if draft.description.trim().is_empty() {
        errors.push(EntryValidationError {
            entry_number,
            movement_number: None,
            field: "description".to_owned(),
            code: "missing_description".to_owned(),
            message: "The entry description is empty.".to_owned(),
            suggested_account_keys: Vec::new(),
            question_for_user: Some("What should this transaction be called?".to_owned()),
        });
    }
    if draft.movements.is_empty() || draft.movements.len() > MAX_MOVEMENTS_PER_ENTRY {
        errors.push(EntryValidationError {
            entry_number,
            movement_number: None,
            field: "movements".to_owned(),
            code: "invalid_movement_count".to_owned(),
            message: format!(
                "An entry must contain between 1 and {MAX_MOVEMENTS_PER_ENTRY} movements."
            ),
            suggested_account_keys: Vec::new(),
            question_for_user: draft.movements.is_empty().then(|| {
                "Which account did the money come from, which account did it go to, and how much was it?"
                    .to_owned()
            }),
        });
    }
    for (movement_index, movement) in draft.movements.iter().enumerate() {
        let movement_number = Some(movement_index + 1);
        if movement.amount_minor <= 0 {
            errors.push(EntryValidationError {
                entry_number,
                movement_number,
                field: "amount_minor".to_owned(),
                code: "invalid_amount".to_owned(),
                message: "The movement amount must be a positive whole-TWD integer.".to_owned(),
                suggested_account_keys: Vec::new(),
                question_for_user: Some(
                    "What is the positive whole-TWD amount for this movement?".to_owned(),
                ),
            });
        }
        if movement.from_account_key == movement.to_account_key {
            errors.push(EntryValidationError {
                entry_number,
                movement_number,
                field: "from_account_key,to_account_key".to_owned(),
                code: "same_account".to_owned(),
                message: "Money cannot move from and to the same account.".to_owned(),
                suggested_account_keys: Vec::new(),
                question_for_user: Some(
                    "Which different source and destination accounts should this movement use?"
                        .to_owned(),
                ),
            });
        }
        for (field, key) in [
            ("from_account_key", movement.from_account_key.as_str()),
            ("to_account_key", movement.to_account_key.as_str()),
        ] {
            match account_map.get(key) {
                None => errors.push(EntryValidationError {
                    entry_number,
                    movement_number,
                    field: field.to_owned(),
                    code: "unknown_account".to_owned(),
                    message: format!("Account “{key}” does not exist."),
                    suggested_account_keys: account_suggestions(key, accounts),
                    question_for_user: None,
                }),
                Some(account) if account.archived => errors.push(EntryValidationError {
                    entry_number,
                    movement_number,
                    field: field.to_owned(),
                    code: "archived_account".to_owned(),
                    message: format!(
                        "Account “{}” is archived and cannot be used for a new movement.",
                        account.key
                    ),
                    suggested_account_keys: Vec::new(),
                    question_for_user: None,
                }),
                Some(_) => {}
            }
        }
    }
}

fn account_suggestions(input: &str, accounts: &[crate::accounts::Account]) -> Vec<String> {
    let input_type = input.split('.').next();
    let mut candidates = accounts
        .iter()
        .filter(|account| !account.archived)
        .filter_map(|account| {
            let same_type = input_type == account.key.split('.').next();
            let distance = string_distance(input, &account.key)
                .min(string_distance(input, &account.name.to_lowercase()));
            if !same_type && distance > 4 {
                return None;
            }
            Some((distance, account.key.clone()))
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|(distance, key)| (*distance, key.clone()));
    candidates.into_iter().take(3).map(|(_, key)| key).collect()
}

fn string_distance(left: &str, right: &str) -> usize {
    let right_chars: Vec<_> = right.chars().collect();
    let mut previous: Vec<usize> = (0..=right_chars.len()).collect();
    for (left_index, left_char) in left.chars().enumerate() {
        let mut current = vec![left_index + 1];
        for (right_index, right_char) in right_chars.iter().enumerate() {
            current.push(
                (previous[right_index + 1] + 1)
                    .min(current[right_index] + 1)
                    .min(previous[right_index] + usize::from(left_char != *right_char)),
            );
        }
        previous = current;
    }
    previous[right_chars.len()]
}

fn idempotency_key(
    grant_id: Uuid,
    tool_name: &str,
    operation: &OperationIdentity,
    entry_index: usize,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"baln-mcp-idempotency-v2\0");
    hasher.update(grant_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(tool_name.as_bytes());
    hasher.update(b"\0");
    match operation {
        OperationIdentity::Explicit(key) => {
            hasher.update(b"explicit\0");
            hasher.update(key.as_bytes());
        }
        OperationIdentity::Automatic {
            session_id,
            request_id,
            nonce,
        } => {
            hasher.update(b"automatic\0");
            hasher.update(session_id.as_deref().unwrap_or("sessionless").as_bytes());
            hasher.update(b"\0");
            hasher.update(request_id.as_bytes());
            hasher.update(b"\0");
            hasher.update(nonce.as_bytes());
        }
    }
    hasher.update(b"\0");
    hasher.update((entry_index as u64).to_be_bytes());
    format!("mcp:v2:{grant_id}:{}", hex::encode(hasher.finalize()))
}

fn postings_from_movements(movements: &[MovementInput]) -> Vec<PostingInput> {
    movements
        .iter()
        .flat_map(|movement| {
            [
                PostingInput {
                    account_key: movement.from_account_key.clone(),
                    amount_minor: -movement.amount_minor,
                    memo: movement.memo.clone(),
                },
                PostingInput {
                    account_key: movement.to_account_key.clone(),
                    amount_minor: movement.amount_minor,
                    memo: movement.memo.clone(),
                },
            ]
        })
        .collect()
}

fn success(summary: impl Into<String>, details: Value) -> CallToolResult {
    let summary = summary.into();
    let structured = merge_result(
        json!({
            "status": "success",
            "summary": summary,
            "action_required": false,
            "next_action": null,
            "questions_for_user": []
        }),
        details,
    );
    let mut result = CallToolResult::success(vec![ContentBlock::text(summary)]);
    result.structured_content = Some(structured);
    result
}

fn action_error(
    status: &str,
    summary: impl Into<String>,
    next_action: impl Into<String>,
    questions_for_user: Vec<String>,
    details: Value,
) -> CallToolResult {
    let summary = summary.into();
    let next_action = next_action.into();
    let text = format!("{summary}\n\nRequired next action: {next_action}");
    let structured = merge_result(
        json!({
            "status": status,
            "summary": summary,
            "action_required": true,
            "next_action": next_action,
            "questions_for_user": questions_for_user
        }),
        details,
    );
    let mut result = CallToolResult::error(vec![ContentBlock::text(text)]);
    result.structured_content = Some(structured);
    result
}

fn merge_result(mut base: Value, details: Value) -> Value {
    if let (Some(base), Some(details)) = (base.as_object_mut(), details.as_object()) {
        for (key, value) in details {
            base.insert(key.clone(), value.clone());
        }
    }
    base
}

fn api_error(error: ApiError) -> CallToolResult {
    let (code, detail, next_action) = match error {
        ApiError::Problem {
            code,
            detail,
            fields,
            ..
        } => {
            if code == "possible_duplicate" {
                return action_error(
                    "needs_user_input",
                    detail,
                    "Show the matching entries to the user and ask whether each pending entry is a separate transaction. If confirmed, retry the exact same operation_key with confirmed_distinct=true only on the confirmed entries. Otherwise, do not create them.",
                    vec![
                        "Baln found a transaction with the same date, accounts, and amounts. Is this a separate transaction that should also be recorded?".to_owned(),
                    ],
                    merge_result(
                        json!({"code": code}),
                        fields.unwrap_or_else(|| json!({})),
                    ),
                );
            }
            let next = match code {
                "not_found" => {
                    "Retrieve the current list and select an existing item. If the intended item is unclear, ask the user which one they mean."
                }
                "unknown_account" | "archived_account" => {
                    "Call get_entry_creation_context for active account keys. If the intended account remains unclear, ask the user, then retry."
                }
                "dedup_key_conflict" => {
                    "Do not retry changed content with the same operation_key. Confirm the intended entry, then use a new operation_key for a distinct operation."
                }
                _ => {
                    "Correct the information described above. If it depends on user intent, ask the user for clarification, then retry."
                }
            };
            (code, detail, next)
        }
        ApiError::Database(error) => {
            tracing::error!(error = %error, "MCP database operation failed");
            (
                "database_error",
                "Baln could not complete the ledger operation.".to_owned(),
                "Retry once. If it still fails, tell the user Baln is temporarily unavailable and do not claim the change was saved.",
            )
        }
        ApiError::Migration(error) => {
            tracing::error!(error = %error, "MCP migration state error");
            (
                "server_error",
                "Baln is not ready to process this request.".to_owned(),
                "Tell the user Baln is temporarily unavailable and retry later.",
            )
        }
        ApiError::Internal(error) => {
            tracing::error!(error = %error, "MCP internal operation failed");
            (
                "server_error",
                "Baln encountered an internal error and did not confirm the operation.".to_owned(),
                "Retry once. If it still fails, tell the user Baln is temporarily unavailable and do not claim the change was saved.",
            )
        }
    };
    action_error(
        "error",
        detail,
        next_action,
        Vec::new(),
        json!({"code": code}),
    )
}

fn atomic_api_error(error: ApiError) -> CallToolResult {
    atomic_operation_api_error(error, "created", "created_count")
}

fn atomic_operation_api_error(
    error: ApiError,
    operation: &'static str,
    count_field: &'static str,
) -> CallToolResult {
    let mut result = api_error(error);
    let mut natural_summary = None;
    let mut natural_next_action = None;
    if let Some(structured) = result.structured_content.as_mut()
        && let Some(object) = structured.as_object_mut()
    {
        object.insert("atomic".to_owned(), json!(true));
        object.insert(count_field.to_owned(), json!(0));
        if let Some(summary) = object.get("summary").and_then(Value::as_str) {
            let summary = format!("No entries were {operation}. {summary}");
            object.insert("summary".to_owned(), json!(summary.clone()));
            natural_summary = Some(summary);
        }
        natural_next_action = object
            .get("next_action")
            .and_then(Value::as_str)
            .map(str::to_owned);
    }
    if let Some(summary) = natural_summary {
        let next_action = natural_next_action.unwrap_or_else(|| {
            "Review the error, correct the complete batch, and retry.".to_owned()
        });
        result.content = vec![ContentBlock::text(format!(
            "{summary}\n\nRequired next action: {next_action}"
        ))];
    }
    result
}

fn parse_account_type(value: &str) -> Result<AccountType, CallToolResult> {
    match value {
        "asset" => Ok(AccountType::Asset),
        "liability" => Ok(AccountType::Liability),
        "income" => Ok(AccountType::Income),
        "expense" => Ok(AccountType::Expense),
        "equity" => Ok(AccountType::Equity),
        _ => Err(action_error(
            "needs_agent_action",
            format!("Account type “{value}” is not valid."),
            "Use exactly one of asset, liability, income, expense, or equity. If the correct accounting type is unclear, ask the user what the account represents.",
            vec!["What does this account represent: money you own, money you owe, income, an expense category, or owner’s equity?".to_owned()],
            json!({"code": "invalid_account_type"}),
        )),
    }
}

fn parse_month(value: &str) -> Result<NaiveDate, ApiError> {
    if value.len() != 7 || value.as_bytes().get(4) != Some(&b'-') {
        return Err(ApiError::bad_request(
            "invalid_month",
            "month must use YYYY-MM format",
        ));
    }
    let date = NaiveDate::parse_from_str(&format!("{value}-01"), "%Y-%m-%d")
        .map_err(|_| ApiError::bad_request("invalid_month", "month must use YYYY-MM format"))?;
    if date.day() != 1 {
        return Err(ApiError::bad_request(
            "invalid_month",
            "month must use YYYY-MM format",
        ));
    }
    Ok(date)
}

fn clean(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn bookkeeping_date(now: DateTime<Utc>, timezone: Tz) -> NaiveDate {
    now.with_timezone(&timezone).date_naive()
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use chrono::TimeZone;

    use super::*;

    #[test]
    fn semantic_movements_generate_balanced_postings() {
        let movement = MovementInput {
            from_account_key: "asset.cash".to_owned(),
            to_account_key: "expense.restaurant".to_owned(),
            amount_minor: 320,
            memo: None,
        };
        let postings = postings_from_movements(&[movement]);
        assert_eq!(
            postings
                .iter()
                .map(|posting| posting.amount_minor)
                .sum::<i64>(),
            0
        );
        assert_eq!(postings[0].amount_minor, -320);
        assert_eq!(postings[1].amount_minor, 320);
    }

    #[test]
    fn split_movements_remain_balanced_and_keep_direction() {
        let postings = postings_from_movements(&[
            MovementInput {
                from_account_key: "asset.cash".to_owned(),
                to_account_key: "expense.restaurant".to_owned(),
                amount_minor: 200,
                memo: Some("meal".to_owned()),
            },
            MovementInput {
                from_account_key: "asset.cash".to_owned(),
                to_account_key: "expense.household".to_owned(),
                amount_minor: 120,
                memo: Some("supplies".to_owned()),
            },
        ]);
        assert_eq!(postings.len(), 4);
        assert_eq!(
            postings
                .iter()
                .map(|posting| posting.amount_minor)
                .sum::<i64>(),
            0
        );
        assert_eq!(
            postings
                .iter()
                .filter(|posting| posting.account_key == "asset.cash")
                .map(|posting| posting.amount_minor)
                .sum::<i64>(),
            -320
        );
    }

    #[test]
    fn refund_direction_credits_expense_and_debits_destination() {
        let postings = postings_from_movements(&[MovementInput {
            from_account_key: "expense.restaurant".to_owned(),
            to_account_key: "asset.cash".to_owned(),
            amount_minor: 100,
            memo: None,
        }]);
        assert_eq!(postings[0].amount_minor, -100);
        assert_eq!(postings[1].amount_minor, 100);
    }

    #[test]
    fn distance_suggestions_prefer_similar_account_keys() {
        assert!(
            string_distance("expense.taxi", "expense.transport")
                < string_distance("expense.taxi", "income.salary")
        );
    }

    #[test]
    fn automatic_keys_are_isolated_across_sessions_and_reused_request_ids() {
        let grant_id = Uuid::parse_str("018f0000-0000-7000-8000-000000000001").unwrap();
        let nonce = Uuid::parse_str("018f0000-0000-7000-8000-000000000002").unwrap();
        let first = OperationIdentity::Automatic {
            session_id: Some("session-a".to_owned()),
            request_id: "7".to_owned(),
            nonce,
        };
        let second = OperationIdentity::Automatic {
            session_id: Some("session-b".to_owned()),
            request_id: "7".to_owned(),
            nonce,
        };

        assert_ne!(
            idempotency_key(grant_id, "create_entries", &first, 0),
            idempotency_key(grant_id, "create_entries", &second, 0)
        );
    }

    #[test]
    fn distinct_automatic_operations_do_not_collide_at_batch_index_zero() {
        let grant_id = Uuid::parse_str("018f0000-0000-7000-8000-000000000001").unwrap();
        let first = OperationIdentity::Automatic {
            session_id: Some("same-session".to_owned()),
            request_id: "reused-id".to_owned(),
            nonce: Uuid::parse_str("018f0000-0000-7000-8000-000000000002").unwrap(),
        };
        let second = OperationIdentity::Automatic {
            session_id: Some("same-session".to_owned()),
            request_id: "reused-id".to_owned(),
            nonce: Uuid::parse_str("018f0000-0000-7000-8000-000000000003").unwrap(),
        };

        assert_ne!(
            idempotency_key(grant_id, "create_entries", &first, 0),
            idempotency_key(grant_id, "create_entries", &second, 0)
        );
    }

    #[test]
    fn explicit_operation_key_is_durable_and_batch_keys_are_distinct() {
        let grant_id = Uuid::parse_str("018f0000-0000-7000-8000-000000000001").unwrap();
        let operation = OperationIdentity::Explicit(
            Uuid::parse_str("018f0000-0000-4000-8000-000000000042").unwrap(),
        );
        let keys = (0..100)
            .map(|index| idempotency_key(grant_id, "create_entries", &operation, index))
            .collect::<Vec<_>>();

        assert_eq!(keys.len(), keys.iter().collect::<HashSet<_>>().len());
        assert_eq!(
            keys[0],
            idempotency_key(grant_id, "create_entries", &operation, 0)
        );
        assert_ne!(
            keys[0],
            idempotency_key(
                grant_id,
                "create_entries",
                &OperationIdentity::Explicit(
                    Uuid::parse_str("018f0000-0000-4000-8000-000000000043").unwrap(),
                ),
                0
            )
        );
    }

    #[test]
    fn create_entries_is_the_only_create_tool_and_is_closed_world_and_idempotent() {
        let tools = build_tools();
        assert!(tools.iter().all(|tool| tool.name != "create_entry"));
        let create = tools
            .iter()
            .find(|tool| tool.name == "create_entries")
            .unwrap();
        let annotations = create.annotations.as_ref().unwrap();
        assert_eq!(annotations.open_world_hint, Some(false));
        assert_eq!(annotations.idempotent_hint, Some(true));
        assert_eq!(
            create.meta.as_ref().unwrap().0["securitySchemes"][0]["scopes"][0],
            "ledger:write"
        );
    }

    #[test]
    fn possible_duplicates_are_returned_as_user_input_actions() {
        let result = atomic_api_error(ApiError::conflict_with_fields(
            "possible_duplicate",
            "one entry may already be recorded",
            json!({
                "matches": [{
                    "pending_entry_number": 1,
                    "existing_entries": [{"id": "018f0000-0000-7000-8000-000000000001"}],
                    "pending_entry_numbers": []
                }]
            }),
        ));
        let structured = result.structured_content.unwrap();

        assert_eq!(structured["status"], "needs_user_input");
        assert_eq!(structured["code"], "possible_duplicate");
        assert_eq!(structured["atomic"], true);
        assert_eq!(structured["created_count"], 0);
        assert_eq!(structured["matches"][0]["pending_entry_number"], 1);
        assert!(
            structured["next_action"]
                .as_str()
                .unwrap()
                .contains("confirmed_distinct=true")
        );
    }

    #[test]
    fn account_deletion_is_destructive_and_requires_delete_scope() {
        let tools = build_tools();
        let delete = tools
            .iter()
            .find(|tool| tool.name == "delete_account")
            .unwrap();
        let annotations = delete.annotations.as_ref().unwrap();
        assert_eq!(annotations.read_only_hint, Some(false));
        assert_eq!(annotations.destructive_hint, Some(true));
        assert_eq!(annotations.idempotent_hint, Some(true));
        assert_eq!(annotations.open_world_hint, Some(false));
        assert_eq!(
            delete.meta.as_ref().unwrap().0["securitySchemes"][0]["scopes"][0],
            "ledger:delete"
        );
        assert!(
            delete
                .description
                .as_deref()
                .unwrap()
                .contains("must be archived instead")
        );
    }

    #[test]
    fn entry_mutation_tools_are_plural_only_and_have_safe_annotations() {
        assert!(SERVER_INSTRUCTIONS.contains("plural update_entries and delete_entries"));
        assert!(SERVER_INSTRUCTIONS.contains("if any batch item is invalid or missing"));

        let tools = build_tools();
        assert!(tools.iter().all(|tool| tool.name != "update_entry"));
        assert!(tools.iter().all(|tool| tool.name != "delete_entry"));

        let update = tools
            .iter()
            .find(|tool| tool.name == "update_entries")
            .unwrap();
        let update_annotations = update.annotations.as_ref().unwrap();
        assert_eq!(update_annotations.read_only_hint, Some(false));
        assert_eq!(update_annotations.destructive_hint, Some(false));
        assert_eq!(update_annotations.idempotent_hint, Some(true));
        assert_eq!(update_annotations.open_world_hint, Some(false));
        assert_eq!(
            update.meta.as_ref().unwrap().0["securitySchemes"][0]["scopes"][0],
            "ledger:write"
        );
        assert!(
            update
                .description
                .as_deref()
                .unwrap()
                .contains("if any item is invalid or missing, no entries are updated")
        );

        let delete = tools
            .iter()
            .find(|tool| tool.name == "delete_entries")
            .unwrap();
        let delete_annotations = delete.annotations.as_ref().unwrap();
        assert_eq!(delete_annotations.read_only_hint, Some(false));
        assert_eq!(delete_annotations.destructive_hint, Some(true));
        assert_eq!(delete_annotations.idempotent_hint, Some(true));
        assert_eq!(delete_annotations.open_world_hint, Some(false));
        assert_eq!(
            delete.meta.as_ref().unwrap().0["securitySchemes"][0]["scopes"][0],
            "ledger:delete"
        );
        assert!(
            delete
                .description
                .as_deref()
                .unwrap()
                .contains("If any ID is missing, none are deleted")
        );
    }

    #[test]
    fn batch_entry_inputs_reject_malformed_ids_and_unknown_fields() {
        let malformed = parse_input::<DeleteEntriesInput>(json!({
            "entry_ids": ["not-a-uuid"]
        }))
        .unwrap_err();
        assert_eq!(
            malformed.structured_content.unwrap()["code"],
            "invalid_tool_input"
        );

        let unknown = parse_input::<UpdateEntriesInput>(json!({
            "entries": [{
                "entry_id": "018f0000-0000-7000-8000-000000000001",
                "description": "Lunch",
                "movements": [{
                    "from_account_key": "asset.cash",
                    "to_account_key": "expense.restaurant",
                    "amount_minor": 320
                }],
                "unexpected": true
            }]
        }))
        .unwrap_err();
        assert_eq!(
            unknown.structured_content.unwrap()["code"],
            "invalid_tool_input"
        );
    }

    #[test]
    fn atomic_mutation_errors_report_operation_specific_zero_counts() {
        let update =
            atomic_operation_api_error(ApiError::not_found("entry"), "updated", "updated_count");
        let update = update.structured_content.unwrap();
        assert_eq!(update["atomic"], true);
        assert_eq!(update["updated_count"], 0);
        assert!(
            update["summary"]
                .as_str()
                .unwrap()
                .starts_with("No entries were updated.")
        );

        let delete =
            atomic_operation_api_error(ApiError::not_found("entry"), "deleted", "deleted_count");
        let delete = delete.structured_content.unwrap();
        assert_eq!(delete["atomic"], true);
        assert_eq!(delete["deleted_count"], 0);
        assert!(
            delete["summary"]
                .as_str()
                .unwrap()
                .starts_with("No entries were deleted.")
        );
    }

    #[test]
    fn foreign_currency_policy_is_exposed_to_agents() {
        assert!(SERVER_INSTRUCTIONS.contains("automatically convert"));
        assert!(SERVER_INSTRUCTIONS.contains("get_entry_creation_context"));

        let policy = foreign_currency_policy();
        assert_eq!(policy["behavior"], "convert_automatically_when_reliable");
        assert_eq!(policy["rounding"], "nearest whole TWD");
        assert_eq!(policy["prohibited"], "guessing or silently converting");

        let tools = build_tools();
        let context = tools
            .iter()
            .find(|tool| tool.name == "get_entry_creation_context")
            .unwrap();
        assert!(
            context
                .description
                .as_deref()
                .unwrap()
                .contains("foreign-currency automatic-conversion policy")
        );

        for name in ["create_entries", "update_entries"] {
            let tool = tools.iter().find(|tool| tool.name == name).unwrap();
            assert!(
                tool.description
                    .as_deref()
                    .unwrap()
                    .contains("foreign-currency"),
                "{name} must expose the foreign-currency policy"
            );
        }

        let create = tools
            .iter()
            .find(|tool| tool.name == "create_entries")
            .unwrap();
        let input_schema = serde_json::to_string(&create.input_schema).unwrap();
        assert!(input_schema.contains("automatically convert"));
        assert!(input_schema.contains("exchange rate"));
        assert!(input_schema.contains("operation_key"));
        assert!(input_schema.contains("confirmed_distinct"));
        assert!(input_schema.contains("\"format\":\"uuid\""));
        assert!(
            create
                .description
                .as_deref()
                .unwrap()
                .contains("including after reconnects")
        );
        assert!(
            create
                .description
                .as_deref()
                .unwrap()
                .contains("possible duplicate")
        );
        assert!(SERVER_INSTRUCTIONS.contains("confirmed_distinct"));
    }

    #[test]
    fn create_entries_rejects_non_uuid_operation_keys() {
        let error = parse_input::<CreateEntriesInput>(json!({
            "operation_key": "123",
            "entries": [{
                "description": "Lunch",
                "movements": [{
                    "from_account_key": "asset.cash",
                    "to_account_key": "expense.restaurant",
                    "amount_minor": 320
                }]
            }]
        }))
        .unwrap_err();

        assert_eq!(
            error.structured_content.unwrap()["code"],
            "invalid_tool_input"
        );
    }

    #[test]
    fn tool_errors_include_plain_language_action() {
        let result = action_error(
            "needs_user_input",
            "The payment account is unclear.",
            "Ask the user which card they used.",
            vec!["Which card did you use?".to_owned()],
            json!({"code": "ambiguous_account"}),
        );
        let text = result.content[0].as_text().unwrap();
        assert!(text.text.contains("Required next action"));
        let structured = result.structured_content.unwrap();
        assert_eq!(structured["action_required"], true);
        assert_eq!(
            structured["questions_for_user"][0],
            "Which card did you use?"
        );
    }

    #[test]
    fn bookkeeping_date_uses_configured_timezone_at_utc_midnight() {
        let before_midnight = Utc
            .with_ymd_and_hms(2026, 7, 24, 15, 59, 59)
            .single()
            .unwrap();
        let after_midnight = Utc
            .with_ymd_and_hms(2026, 7, 24, 16, 0, 0)
            .single()
            .unwrap();
        assert_eq!(
            bookkeeping_date(before_midnight, chrono_tz::Asia::Taipei),
            NaiveDate::from_ymd_opt(2026, 7, 24).unwrap()
        );
        assert_eq!(
            bookkeeping_date(after_midnight, chrono_tz::Asia::Taipei),
            NaiveDate::from_ymd_opt(2026, 7, 25).unwrap()
        );
    }
}
