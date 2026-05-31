import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import ErrorBoundary from "@/components/ErrorBoundary";
import { usePresenceHeartbeat } from "@/hooks/use-presence-heartbeat";
import Home from "@/pages/Home";
import AuthPage from "@/pages/auth-page";
import ProfilePage from "@/pages/profile-page";
import ForgotPasswordPage from "@/pages/forgot-password-page";
import ResetPasswordPage from "@/pages/reset-password-page";
import AdminPage from "@/pages/admin-page";
import HistoryPage from "@/pages/history-page";
import PrintPage from "@/pages/print-page";
import PrivacyPolicy from "@/pages/privacy-policy";
import TermsOfService from "@/pages/terms-of-service";
import NotFound from "@/pages/not-found";

function Router() {
  // Tick the presence heartbeat while logged in — lives at the router level
  // so it runs on every authenticated page without needing a per-page hookup.
  usePresenceHeartbeat();
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/auth" component={AuthPage} />
      {/* /stats was superseded by /history — redirect so bookmarks still work */}
      <Route path="/stats">
        <Redirect to="/history" />
      </Route>
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/print" component={PrintPage} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/history" component={HistoryPage} />
      <ProtectedRoute path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
