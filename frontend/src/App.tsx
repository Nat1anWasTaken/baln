import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/auth/protected-route";
import { AppLoading } from "@/components/app-loading";
import { AppShell } from "@/components/app-shell";

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
const ReportsPage = lazy(() =>
  import("@/pages/reports-page").then((module) => ({
    default: module.ReportsPage,
  })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/not-found-page").then((module) => ({
    default: module.NotFoundPage,
  })),
);

export default function App() {
  return (
    <Suspense fallback={<AppLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route element={<ProtectedRoute />}>
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
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
