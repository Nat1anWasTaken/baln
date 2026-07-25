use utoipa::{
    Modify, OpenApi,
    openapi::security::{Http, HttpAuthScheme, SecurityScheme},
};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Baln Personal Finance API",
        version = "1.0.0",
        description = "Multi-user double-entry personal finance ledger"
    ),
    tags(
        (name = "auth", description = "Google OIDC and token lifecycle"),
        (name = "accounts", description = "Ledger accounts"),
        (name = "entries", description = "Balanced journal entries"),
        (name = "reports", description = "Balances and period reports")
    ),
    paths(
        crate::auth::routes::start,
        crate::auth::routes::callback,
        crate::auth::routes::token,
        crate::auth::routes::refresh,
        crate::auth::routes::logout,
        crate::auth::routes::me,
        crate::auth::api_tokens::list,
        crate::auth::api_tokens::create,
        crate::auth::api_tokens::revoke,
        crate::accounts::routes::create,
        crate::accounts::routes::list,
        crate::accounts::routes::get_one,
        crate::accounts::routes::update,
        crate::accounts::routes::delete,
        crate::accounts::routes::balance,
        crate::entries::routes::create,
        crate::entries::routes::list,
        crate::entries::routes::get_one,
        crate::entries::routes::update,
        crate::entries::routes::delete,
        crate::reports::routes::summary,
        crate::reports::routes::monthly
    ),
    components(schemas(
        crate::auth::User,
        crate::auth::routes::ExchangeCodeRequest,
        crate::auth::service::TokenResponse,
        crate::auth::api_tokens::ApiTokenStatus,
        crate::auth::api_tokens::ApiToken,
        crate::auth::api_tokens::CreateApiTokenRequest,
        crate::auth::api_tokens::CreatedApiToken,
        crate::accounts::AccountType,
        crate::accounts::Account,
        crate::accounts::CreateAccountRequest,
        crate::accounts::UpdateAccountRequest,
        crate::accounts::AccountBalance,
        crate::entries::PostingInput,
        crate::entries::CreateEntryRequest,
        crate::entries::UpdateEntryRequest,
        crate::entries::AccountSummary,
        crate::entries::PostingResponse,
        crate::entries::EntryResponse,
        crate::entries::PossibleDuplicateMatch,
        crate::entries::EntryPage,
        crate::reports::ReportAccountTotal,
        crate::reports::PeriodSummary
    )),
    modifiers(&SecurityAddon)
)]
pub struct ApiDoc;

struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            let mut bearer = Http::new(HttpAuthScheme::Bearer);
            bearer.description =
                Some("Short-lived session JWT or user-generated personal API token".to_owned());
            components.add_security_scheme("bearer_auth", SecurityScheme::Http(bearer));
        }
    }
}
