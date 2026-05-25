import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import ErrorBoundary from "@/components/ErrorBoundary";
import Home from "@/pages/Home";
import AuthPage from "@/pages/auth-page";
import ProfilePage from "@/pages/profile-page";
import ForgotPasswordPage from "@/pages/forgot-password-page";
import ResetPasswordPage from "@/pages/reset-password-page";
import AdminPage from "@/pages/admin-page";
import HistoryPage from "@/pages/history-page";
import NotFound from "@/pages/not-found";

function Router() {
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
