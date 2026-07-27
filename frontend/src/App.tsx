import { lazy, Suspense } from "react";
import { type Location, Route, Routes, useLocation } from "react-router-dom";

import { ProtectedRoute } from "@/auth/protected-route";
import { AppLoading } from "@/components/app-loading";
import { AppShell } from "@/components/app-shell";
import { useIsMobile } from "@/hooks/use-mobile";
import { getEntryEditorBackground } from "@/lib/entry-navigation";
import { routeModules } from "@/lib/route-modules";

const LoginPage = lazy(() =>
  routeModules.login().then((module) => ({
    default: module.LoginPage,
  })),
);
const AuthCallbackPage = lazy(() =>
  routeModules.authCallback().then((module) => ({
    default: module.AuthCallbackPage,
  })),
);
const DashboardPage = lazy(() =>
  routeModules.dashboard().then((module) => ({
    default: module.DashboardPage,
  })),
);
const AccountsPage = lazy(() =>
  routeModules.accounts().then((module) => ({
    default: module.AccountsPage,
  })),
);
const EntriesPage = lazy(() =>
  routeModules.entries().then((module) => ({
    default: module.EntriesPage,
  })),
);
const EntryDetailPage = lazy(() =>
  routeModules.entryDetail().then((module) => ({
    default: module.EntryDetailPage,
  })),
);
const EntryEditorPage = lazy(() =>
  routeModules.entryEditor().then((module) => ({
    default: module.EntryEditorPage,
  })),
);
const EntryEditorSheet = lazy(() =>
  routeModules.entryEditor().then((module) => ({
    default: module.EntryEditorSheet,
  })),
);
const ReportsPage = lazy(() =>
  routeModules.reports().then((module) => ({
    default: module.ReportsPage,
  })),
);
const ApiTokensPage = lazy(() =>
  routeModules.apiTokens().then((module) => ({
    default: module.ApiTokensPage,
  })),
);
const OAuthConsentPage = lazy(() =>
  routeModules.oauthConsent().then((module) => ({
    default: module.OAuthConsentPage,
  })),
);
const ConnectedAppsPage = lazy(() =>
  routeModules.connectedApps().then((module) => ({
    default: module.ConnectedAppsPage,
  })),
);
const NotFoundPage = lazy(() =>
  routeModules.notFound().then((module) => ({
    default: module.NotFoundPage,
  })),
);

export default function App() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const editMatch = location.pathname.match(/^\/entries\/([^/]+)\/edit$/);
  const isEntryEditor =
    location.pathname === "/entries/new" || editMatch !== null;
  const isMobileEditor = isMobile && isEntryEditor;
  const fallbackBackground: Location = {
    pathname: editMatch ? `/entries/${editMatch[1]}` : "/entries",
    search: location.search,
    hash: "",
    state: null,
    key: editMatch ? "direct-entry-edit" : "direct-entry-create",
  };
  const backgroundLocation = isMobileEditor
    ? (getEntryEditorBackground(location.state) ?? fallbackBackground)
    : undefined;

  return (
    <Suspense fallback={<AppLoading />}>
      <Routes location={backgroundLocation ?? location}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/oauth/consent" element={<OAuthConsentPage />} />
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="/entries" element={<EntriesPage />} />
            <Route path="/entries/new" element={<EntryEditorPage />} />
            <Route path="/entries/:entryId" element={<EntryDetailPage />} />
            <Route
              path="/entries/:entryId/edit"
              element={<EntryEditorPage />}
            />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings/api-tokens" element={<ApiTokensPage />} />
            <Route
              path="/settings/connected-apps"
              element={<ConnectedAppsPage />}
            />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      {isMobileEditor ? (
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route
              path="/entries/new"
              element={
                <EntryEditorSheet backgroundLocation={backgroundLocation!} />
              }
            />
            <Route
              path="/entries/:entryId/edit"
              element={
                <EntryEditorSheet backgroundLocation={backgroundLocation!} />
              }
            />
          </Route>
        </Routes>
      ) : null}
    </Suspense>
  );
}
