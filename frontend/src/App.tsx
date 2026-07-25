import { lazy, Suspense } from "react";
import { type Location, Route, Routes, useLocation } from "react-router-dom";

import { ProtectedRoute } from "@/auth/protected-route";
import { AppLoading } from "@/components/app-loading";
import { AppShell } from "@/components/app-shell";
import { useIsMobile } from "@/hooks/use-mobile";
import { getEntryCreateBackground } from "@/lib/entry-navigation";

const LoginPage = lazy(() =>
  import("@/pages/login-page").then((module) => ({
    default: module.LoginPage,
  })),
);
const AuthCallbackPage = lazy(() =>
  import("@/pages/auth-callback-page").then((module) => ({
    default: module.AuthCallbackPage,
  })),
);
const DashboardPage = lazy(() =>
  import("@/pages/dashboard-page").then((module) => ({
    default: module.DashboardPage,
  })),
);
const AccountsPage = lazy(() =>
  import("@/pages/accounts-page").then((module) => ({
    default: module.AccountsPage,
  })),
);
const EntriesPage = lazy(() =>
  import("@/pages/entries-page").then((module) => ({
    default: module.EntriesPage,
  })),
);
const EntryDetailPage = lazy(() =>
  import("@/pages/entry-detail-page").then((module) => ({
    default: module.EntryDetailPage,
  })),
);
const EntryEditorPage = lazy(() =>
  import("@/pages/entry-editor-page").then((module) => ({
    default: module.EntryEditorPage,
  })),
);
const EntryEditorSheet = lazy(() =>
  import("@/pages/entry-editor-page").then((module) => ({
    default: module.EntryEditorSheet,
  })),
);
const ReportsPage = lazy(() =>
  import("@/pages/reports-page").then((module) => ({
    default: module.ReportsPage,
  })),
);
const ApiTokensPage = lazy(() =>
  import("@/pages/api-tokens-page").then((module) => ({
    default: module.ApiTokensPage,
  })),
);
const OAuthConsentPage = lazy(() =>
  import("@/pages/oauth-consent-page").then((module) => ({
    default: module.OAuthConsentPage,
  })),
);
const ConnectedAppsPage = lazy(() =>
  import("@/pages/connected-apps-page").then((module) => ({
    default: module.ConnectedAppsPage,
  })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/not-found-page").then((module) => ({
    default: module.NotFoundPage,
  })),
);

export default function App() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const isMobileCreate = isMobile && location.pathname === "/entries/new";
  const fallbackBackground: Location = {
    pathname: "/entries",
    search: location.search,
    hash: "",
    state: null,
    key: "direct-entry-create",
  };
  const backgroundLocation = isMobileCreate
    ? (getEntryCreateBackground(location.state) ?? fallbackBackground)
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
      {isMobileCreate ? (
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route
              path="/entries/new"
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
