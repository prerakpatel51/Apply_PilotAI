import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "./lib/auth";
import { WorkspaceProvider } from "./lib/workspace";
import { TokenometerProvider } from "./lib/tokenometer";
import { AppLayout } from "./components/AppLayout";
import { LandingPage } from "./pages/Landing";
import { SignInPage } from "./pages/SignIn";
import { SignUpPage } from "./pages/SignUp";
import { ForgotPasswordPage } from "./pages/ForgotPassword";
import { ResetPasswordPage } from "./pages/ResetPassword";
import { ProviderPage } from "./pages/Provider";
import { ProfilePage } from "./pages/Profile";
import { ResumePage } from "./pages/Resume";
import { SearchPage } from "./pages/Search";
import { JobsPage } from "./pages/Jobs";
import { JobResumeAlignmentPage } from "./pages/JobResumeAlignment";
import { GeneratedResumesPage } from "./pages/GeneratedResumes";
import { HistoryPage } from "./pages/History";
import { UsagePage } from "./pages/Usage";
import { SettingsPage } from "./pages/Settings";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminOverviewPage } from "./pages/admin/Overview";
import { AdminUsersPage } from "./pages/admin/Users";
import { AdminUserDetailPage } from "./pages/admin/UserDetail";
import { AdminRunsPage } from "./pages/admin/Runs";
import { AdminPromptsPage } from "./pages/admin/Prompts";
import { AdminAuditPage } from "./pages/admin/Audit";
import { AdminAnalyticsPage } from "./pages/admin/Analytics";
import { AdminSystemPage } from "./pages/admin/System";

function Splash() {
  return (
    <div className="min-h-screen grid place-items-center bg-bg text-fg">
      <div className="flex items-center gap-3 text-subtle">
        <Loader2 className="animate-spin" size={18} />
        <span>Loading workspace</span>
      </div>
    </div>
  );
}

function Protected({ children }: { children: ReactElement }) {
  const { token, user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!token || !user) return <Navigate to="/signin" replace />;
  return (
    <WorkspaceProvider>
      <TokenometerProvider>{children}</TokenometerProvider>
    </WorkspaceProvider>
  );
}

function PublicOnly({ children }: { children: ReactElement }) {
  const { token, loading } = useAuth();
  if (loading) return <Splash />;
  if (token) return <Navigate to="/app/search" replace />;
  return children;
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/signin" element={<PublicOnly><SignInPage /></PublicOnly>} />
        <Route path="/signup" element={<PublicOnly><SignUpPage /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
        <Route path="/reset-password" element={<PublicOnly><ResetPasswordPage /></PublicOnly>} />
        <Route path="/app" element={<Protected><AppLayout /></Protected>}>
          <Route index element={<Navigate to="search" replace />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="jobs/:runId/:matchId" element={<JobResumeAlignmentPage />} />
          <Route path="generated-resumes" element={<GeneratedResumesPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="provider" element={<ProviderPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="resume" element={<ResumePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="users/:id" element={<AdminUserDetailPage />} />
            <Route path="runs" element={<AdminRunsPage />} />
            <Route path="prompts" element={<AdminPromptsPage />} />
            <Route path="audit" element={<AdminAuditPage />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
            <Route path="system" element={<AdminSystemPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
