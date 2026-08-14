import { Navigate, Route, Routes } from "react-router";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import type { ReactNode } from "react";
import { api } from "../convex/_generated/api";
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

function RequireRole({
  min,
  children,
}: {
  min: "manager" | "admin";
  children: ReactNode;
}) {
  const me = useQuery(api.users.me);
  if (me === undefined) return null;
  const rank = { crew: 0, manager: 1, admin: 2 } as const;
  const role = (me?.role ?? "crew") as keyof typeof rank;
  if (rank[role] < rank[min]) return <Navigate to="/dashboard" replace />;
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
                      <RequireRole min="manager">
                        <ChannelsPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/analytics"
                    element={
                      <RequireRole min="manager">
                        <AnalyticsPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/team"
                    element={
                      <RequireRole min="manager">
                        <TeamExpensesPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <RequireRole min="manager">
                        <SettingsPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/logs"
                    element={
                      <RequireRole min="manager">
                        <LogsPage />
                      </RequireRole>
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
