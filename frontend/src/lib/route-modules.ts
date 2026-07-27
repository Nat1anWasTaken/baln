export const routeModules = {
  accounts: () => import("@/pages/accounts-page"),
  apiTokens: () => import("@/pages/api-tokens-page"),
  authCallback: () => import("@/pages/auth-callback-page"),
  connectedApps: () => import("@/pages/connected-apps-page"),
  dashboard: () => import("@/pages/dashboard-page"),
  entries: () => import("@/pages/entries-page"),
  entryDetail: () => import("@/pages/entry-detail-page"),
  entryEditor: () => import("@/pages/entry-editor-page"),
  login: () => import("@/pages/login-page"),
  notFound: () => import("@/pages/not-found-page"),
  oauthConsent: () => import("@/pages/oauth-consent-page"),
  reports: () => import("@/pages/reports-page"),
} as const;

export type RouteModuleKey = keyof typeof routeModules;

export function routeModuleKeyForPath(pathname: string): RouteModuleKey {
  if (pathname === "/") return "dashboard";
  if (pathname === "/login") return "login";
  if (pathname === "/auth/callback") return "authCallback";
  if (pathname === "/accounts") return "accounts";
  if (pathname === "/reports") return "reports";
  if (pathname === "/settings/api-tokens") return "apiTokens";
  if (pathname === "/settings/connected-apps") return "connectedApps";
  if (pathname === "/oauth/consent") return "oauthConsent";
  if (pathname === "/entries") return "entries";
  if (
    pathname === "/entries/new" ||
    /^\/entries\/[^/]+\/edit$/.test(pathname)
  ) {
    return "entryEditor";
  }
  if (/^\/entries\/[^/]+$/.test(pathname)) return "entryDetail";
  return "notFound";
}

export async function preloadAppRoute(pathname: string): Promise<void> {
  const moduleKey = routeModuleKeyForPath(pathname);
  await routeModules[moduleKey]();
}
