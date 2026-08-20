import { Navigate, Route, Routes } from "react-router";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import type { ReactNode } from "react";
import { api } from "../convex/_generated/api";
import { canAccessPage, type Page, type Role } from "./lib/roles";
import AppShell from "./components/AppShell";
import SignInPage from "./pages/SignInPage";
import DashboardPage from "./pages/DashboardPage";
import CalendarPage from "./pages/CalendarPage";
import ChannelsPage from "./pages/ChannelsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import TeamExpensesPage from "./pages/TeamExpensesPage";
import LogsPage from "./pages/LogsPage";
import SettingsPage from "./pages/SettingsPage";
import GuestPortalPage from "./pages/GuestPortalPage";
import BookPage from "./pages/BookPage";
import GuestsPage from "./pages/GuestsPage";
import RequestsPage from "./pages/RequestsPage";

function RequirePage({
  page,
  children,
}: {
  page: Page;
  children: ReactNode;
}) {
  const me = useQuery(api.users.me);
  if (me === undefined) return null;
  const role = (me?.role ?? "crew") as Role;
  if (!canAccessPage(role, page)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public pages — outside auth entirely */}
      <Route path="/" element={<BookPage />} />
      <Route path="/book" element={<Navigate to="/" replace />} />
      <Route path="/guest/:token" element={<GuestPortalPage />} />
      {/* Staff entrance — any backend link works; /admin is the memorable one */}
      <Route path="/admin" element={<Navigate to="/dashboard" replace />} />

      <Route
        path="*"
        element={
          <>
            <AuthLoading>
              <div className="flex h-full items-center justify-center">
                <div className="skeleton h-10 w-40" />
              </div>
            </AuthLoading>
            <Unauthenticated>
              <SignInPage />
            </Unauthenticated>
            <Authenticated>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/guests" element={<GuestsPage />} />
                  <Route path="/requests" element={<RequestsPage />} />
                  <Route
                    path="/channels"
                    element={
                      <RequirePage page="channels">
                        <ChannelsPage />
                      </RequirePage>
                    }
                  />
                  <Route
                    path="/analytics"
                    element={
                      <RequirePage page="analytics">
                        <AnalyticsPage />
                      </RequirePage>
                    }
                  />
                  <Route
                    path="/team"
                    element={
                      <RequirePage page="team">
                        <TeamExpensesPage />
                      </RequirePage>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <RequirePage page="settings">
                        <SettingsPage />
                      </RequirePage>
                    }
                  />
                  <Route
                    path="/logs"
                    element={
                      <RequirePage page="logs">
                        <LogsPage />
                      </RequirePage>
                    }
                  />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Route>
              </Routes>
            </Authenticated>
          </>
        }
      />
    </Routes>
  );
}
