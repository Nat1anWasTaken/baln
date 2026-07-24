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

const MAX_BATCH_ENTRIES: usize = 100;
const MAX_MOVEMENTS_PER_ENTRY: usize = 50;

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
            "create_entry" => {
                if let Err(result) = self.require(&principal, "ledger:write") {
                    result
                } else {
                    match parse_input::<EntryDraft>(arguments) {
                        Ok(draft) => {
                            let request_id = request_id(&context);
                            self.create_entries(principal, vec![draft], request_id, false)
                                .await
                        }
                        Err(result) => result,
                    }
                }
            }
            "create_entries" => {
                if let Err(result) = self.require(&principal, "ledger:write") {
                    result
                } else {
                    match parse_input::<CreateEntriesInput>(arguments) {
                        Ok(input) => {
                            let request_id = request_id(&context);
                            self.create_entries(principal, input.entries, request_id, true)
                                .await
                        }
                        Err(result) => result,
                    }
                }
            }
            "update_entry" => {
                if let Err(result) = self.require(&principal, "ledger:write") {
                    result
                } else {
                    match parse_input::<UpdateEntryInput>(arguments) {
                        Ok(input) => self.update_entry(principal, input).await,
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
            "delete_entry" => {
                if let Err(result) = self.require(&principal, "ledger:delete") {
                    result
                } else {
                    match parse_input::<EntryIdInput>(arguments) {
                        Ok(input) => match entry_service::delete(
                            &self.state.pool,
                            principal.user.id,
                            input.entry_id,
                        )
                        .await
                        {
                            Ok(()) => success(
                                format!(
                                    "Deleted ledger entry {}. This action cannot be undone through Baln.",
                                    input.entry_id
                                ),
                                json!({"deleted_entry_id": input.entry_id}),
                            ),
                            Err(error) => api_error(error),
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
                    "Baln records whole TWD amounts, and today’s bookkeeping date is {today} in {}. There are no active accounts, so an entry cannot be created yet.",
                    self.state.config.bookkeeping_timezone
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
                    "accounts_by_type": grouped
                }),
            );
        }
        let summary = format!(
            "Baln records whole TWD amounts. Today’s bookkeeping date is {today} in {}. Move money from the payment or source account to the destination account. For an expense, move from an asset or liability account to an expense account; for income, move from an income account to an asset account; for a transfer, move from the source asset to the destination asset; for a refund, move from the expense account back to the asset or liability account. Use these exact active account keys:\n{account_lines}",
            self.state.config.bookkeeping_timezone
        );
        success(
            summary,
            json!({
                "bookkeeping_date": today,
                "timezone": self.state.config.bookkeeping_timezone.to_string(),
                "currency": "TWD",
                "amount_rule": "positive whole TWD",
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
        request_id: String,
        batch: bool,
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
                    &request_id,
                    entry_index,
                )),
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
        let summary = if batch {
            format!(
                "Saved {} ledger entries atomically: {} newly created and {} safely replayed. No further action is required.",
                results.len(),
                created_count,
                replayed_count
            )
        } else {
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

    async fn update_entry(
        &self,
        principal: OAuthPrincipal,
        input: UpdateEntryInput,
    ) -> CallToolResult {
        let draft = EntryDraft {
            date: input.date,
            description: input.description,
            note: input.note,
            movements: input.movements,
        };
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
        validate_draft(0, &draft, &account_map, &accounts, &mut errors);
        if !errors.is_empty() {
            return action_error(
                "needs_agent_action",
                format!("The entry was not updated. {}", errors[0].message),
                "Review the listed fields or call get_entry_creation_context for current account keys, then retry.",
                errors
                    .iter()
                    .filter_map(|error| error.question_for_user.clone())
                    .collect(),
                json!({"code": "entry_validation_failed", "errors": errors}),
            );
        }
        let date = draft.date.unwrap_or_else(|| {
            bookkeeping_date(Utc::now(), self.state.config.bookkeeping_timezone)
        });
        let postings = postings_from_movements(&draft.movements);
        match entry_service::update(
            &self.state.pool,
            principal.user.id,
            input.entry_id,
            UpdateEntryRequest {
                date,
                description: draft.description.trim().to_owned(),
                note: draft.note,
                postings,
            },
        )
        .await
        {
            Ok(entry) => success(
                format!(
                    "Updated “{}” dated {}. No further action is required.",
                    entry.description, entry.date
                ),
                json!({"entry": entry, "movements": draft.movements}),
            ),
            Err(error) => api_error(error),
        }
    }
}

impl ServerHandler for BalnMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build()).with_instructions(
            "Baln is a private TWD double-entry ledger. Before creating an entry, call \
             get_entry_creation_context unless exact active account keys are already known. \
             Never invent an account key. Creation tools accept positive semantic movements \
             from a source account to a destination account and return natural-language next \
             actions whenever more information is required.",
        )
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
    /// Positive whole-TWD amount. Do not use a negative or signed debit/credit amount.
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
    /// Optional note applying to the whole entry.
    note: Option<String>,
    /// One or more positive money movements. Use multiple movements for splits.
    movements: Vec<MovementInput>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct CreateEntriesInput {
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
            "Call this before creating entries unless you already know every exact active account key. It explains Baln’s whole-TWD movement model, today’s bookkeeping date, active accounts, and common transaction directions. If an intended account is still unclear after this call, ask the user which listed account they mean.",
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
        write_tool::<EntryDraft>(
            "create_entry",
            "Create Ledger Entry",
            "Create one balanced entry using only a description and positive semantic movements from source accounts to destination accounts. date defaults to today. Do not send signed postings, totals, IDs, or deduplication keys. If an account key is unknown, call get_entry_creation_context first; if user intent remains ambiguous, ask the user before calling this tool.",
            false,
        ),
        write_tool::<CreateEntriesInput>(
            "create_entries",
            "Create Ledger Entries",
            "Create 1–100 entries atomically using the same semantic movement shape as create_entry. Every item is validated before insertion; if any item is invalid, none are created and the response explains how to repair the complete batch.",
            false,
        ),
        write_tool::<UpdateEntryInput>(
            "update_entry",
            "Update Ledger Entry",
            "Replace an existing entry’s description, date, note, and complete semantic movement list. Retrieve the entry first when the user has not supplied its exact ID or current meaning.",
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
        destructive_tool::<EntryIdInput>(
            "delete_entry",
            "Delete Ledger Entry",
            "Permanently delete one ledger entry by exact UUID. Retrieve and identify the entry before deletion when the user’s target is not already unambiguous.",
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

fn idempotency_key(grant_id: Uuid, request_id: &str, entry_index: usize) -> String {
    let digest = Sha256::digest(format!("{grant_id}:{request_id}:{}", entry_index + 1));
    format!("mcp:{grant_id}:{}", hex::encode(digest))
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
        ApiError::Problem { code, detail, .. } => {
            let next = match code {
                "not_found" => {
                    "Retrieve the current list and select an existing item. If the intended item is unclear, ask the user which one they mean."
                }
                "unknown_account" | "archived_account" => {
                    "Call get_entry_creation_context for active account keys. If the intended account remains unclear, ask the user, then retry."
                }
                "dedup_key_conflict" => {
                    "Do not retry with changed content under the same request. Start a new tool call after confirming the intended entry."
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
    let mut result = api_error(error);
    let mut natural_summary = None;
    let mut natural_next_action = None;
    if let Some(structured) = result.structured_content.as_mut()
        && let Some(object) = structured.as_object_mut()
    {
        object.insert("atomic".to_owned(), json!(true));
        object.insert("created_count".to_owned(), json!(0));
        if let Some(summary) = object.get("summary").and_then(Value::as_str) {
            let summary = format!("No entries were created. {summary}");
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
    fn create_tools_are_closed_world_and_idempotent() {
        let tools = build_tools();
        let create = tools
            .iter()
            .find(|tool| tool.name == "create_entry")
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
