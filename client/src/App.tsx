import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, RouteComponentProps, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { AdminDarkWorkspace } from "@/components/AdminDarkWorkspace";
import { OwnerWorkspace } from "@/components/OwnerWorkspace";
const NotFound = lazy(() => import("@/pages/not-found"));
const Landing = lazy(() => import("@/pages/landing"));
const Login = lazy(() => import("@/pages/auth/login"));
const Register = lazy(() => import("@/pages/auth/register"));
const ResetPassword = lazy(() => import("@/pages/auth/reset-password"));
const OldRegister = lazy(() => import("@/pages/register"));
const PrivacyPolicy = lazy(() => import("@/pages/privacy-policy"));

// Driver pages
const DriverDashboard = lazy(() => import("@/pages/driver/dashboard"));
const DriverLocations = lazy(() => import("@/pages/driver/locations"));
const DriverActivity = lazy(() => import("@/pages/driver/activity"));
const DriverProfile = lazy(() => import("@/pages/driver/profile"));
const DriverCheckIn = lazy(() => import("@/pages/driver/check-in"));
const DriverWallet = lazy(() => import("@/pages/driver/wallet"));
const DriverNotifications = lazy(() => import("@/pages/driver/notifications"));
const DriverReports = lazy(() => import("@/pages/driver/reports"));
const DriverRewards = lazy(() => import("@/pages/driver/rewards"));

// Owner pages
const OwnerDashboard = lazy(() => import("@/pages/owner/dashboard"));
const OwnerLocations = lazy(() => import("@/pages/owner/locations"));
const OwnerDrivers = lazy(() => import("@/pages/owner/drivers"));
const OwnerPayments = lazy(() => import("@/pages/owner/payments"));
const OwnerProfile = lazy(() => import("@/pages/owner/profile"));
const OwnerSubscribe = lazy(() => import("@/pages/owner/subscribe"));
const OwnerPaymentMethods = lazy(() => import("@/pages/owner/payment-methods"));
const OwnerWallet = lazy(() => import("@/pages/owner/wallet"));
const OwnerNotifications = lazy(() => import("@/pages/owner/notifications"));
const OwnerReports = lazy(() => import("@/pages/owner/reports"));

// Admin pages
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminLocations = lazy(() => import("@/pages/admin/locations"));
const AdminPayments = lazy(() => import("@/pages/admin/payments"));
const AdminSubscriptions = lazy(() => import("@/pages/admin/subscriptions"));
const AdminFees = lazy(() => import("@/pages/admin/fees"));
const AdminProfile = lazy(() => import("@/pages/admin/profile"));
const ServiceAccountsPage = lazy(() => import("@/pages/admin/service-accounts"));
const AdminFeatureFlags = lazy(() => import("@/pages/admin/feature-flags"));
const AdminSettings = lazy(() => import("@/pages/admin/settings"));
const AdminBatchPayments = lazy(() => import("@/pages/admin/batch-payments"));
const AdminReconciliation = lazy(() => import("@/pages/admin/reconciliation"));
const AdminBillingSettings = lazy(() => import("@/pages/admin/billing-settings"));
const AdminBilling = lazy(() => import("@/pages/admin/billing"));
const AdminLottery = lazy(() => import("@/pages/admin/lottery"));
const AdminRewardsOperations = lazy(() => import("@/pages/admin/rewards-operations"));
const SuperAdminBillingAuditReport = lazy(() => import("@/pages/super-admin/billing-audit-report"));
const AdminReports = lazy(() => import("@/pages/admin/reports"));
const FinancialOperations = lazy(() => import("@/pages/admin/financial-operations"));
const FinancialOwnerDetail = lazy(() => import("@/pages/admin/financial-operations").then((module) => ({ default: module.FinancialOwnerDetail })));
const FinancialBatchDetail = lazy(() => import("@/pages/admin/financial-operations").then((module) => ({ default: module.FinancialBatchDetail })));
const FinancialAudit = lazy(() => import("@/pages/admin/financial-operations").then((module) => ({ default: module.FinancialAudit })));
const AdministrationRepository = lazy(() => import("@/pages/admin/administration-repository"));
const AdministrationRepositoryDocument = lazy(() => import("@/pages/admin/administration-repository").then((module) => ({ default: module.AdministrationRepositoryDocument })));

// Wrapper components for Register with preselected roles
const GeneralRegister = (props: RouteComponentProps) => <Register />;
const DriverRegister = (props: RouteComponentProps) => <Register preselectedRole="driver" />;
const OwnerRegister = (props: RouteComponentProps) => <Register preselectedRole="owner" />;

function Router() {
  const { user, isLoading, isAuthenticated } = useAuth();

  // Show loading spinner only during initial load
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={GeneralRegister} />
          <Route path="/register/driver" component={DriverRegister} />
          <Route path="/register/owner" component={OwnerRegister} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    );
  }

  // If user is authenticated but doesn't have a role, show old registration
  if (!(user as any).role) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/" component={OldRegister} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    );
  }

  // Role-based routing
  if ((user as any).role === 'driver') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/" component={DriverDashboard} />
          <Route path="/locations" component={DriverLocations} />
          <Route path="/activity" component={DriverActivity} />
          <Route path="/wallet" component={DriverWallet} />
          <Route path="/notifications" component={DriverNotifications} />
          <Route path="/profile" component={DriverProfile} />
          <Route path="/reports" component={DriverReports} />
          <Route path="/rewards" component={DriverRewards} />
          <Route path="/driver/rewards" component={DriverRewards} />
          <Route path="/check-in/:locationId?" component={DriverCheckIn} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    );
  }

  if ((user as any).role === 'owner') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <OwnerWorkspace>
          <Switch>
            <Route path="/" component={OwnerDashboard} />
            <Route path="/dashboard" component={OwnerDashboard} />
            <Route path="/locations" component={OwnerLocations} />
            <Route path="/drivers" component={OwnerDrivers} />
            <Route path="/payments" component={OwnerPayments} />
            <Route path="/wallet" component={OwnerWallet} />
            <Route path="/notifications" component={OwnerNotifications} />
            <Route path="/profile" component={OwnerProfile} />
            <Route path="/subscribe" component={OwnerSubscribe} />
            <Route path="/payment-methods" component={OwnerPaymentMethods} />
            <Route path="/reports" component={OwnerReports} />
            <Route component={NotFound} />
          </Switch>
        </OwnerWorkspace>
      </Suspense>
    );
  }

  if ((user as any).role === 'admin' || (user as any).role === 'super_admin') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <AdminDarkWorkspace>
          <Switch>
            <Route path="/" component={AdminDashboard} />
            <Route path="/users" component={AdminUsers} />
            <Route path="/locations" component={AdminLocations} />
            <Route path="/payments" component={AdminPayments} />
            <Route path="/financial-workspace" component={FinancialOperations} />
            <Route path="/admin/financial-operations" component={FinancialOperations} />
            <Route path="/admin/financial-operations/owners/:ownerId" component={FinancialOwnerDetail} />
            <Route path="/admin/financial-operations/batches/:batchId" component={FinancialBatchDetail} />
            <Route path="/admin/financial-operations/audit" component={FinancialAudit} />
            <Route path="/admin/administration-repository/document/:documentId" component={AdministrationRepositoryDocument} />
            <Route path="/admin/administration-repository" component={AdministrationRepository} />
            <Route path="/batch-payments" component={AdminBatchPayments} />
            <Route path="/reconciliation" component={AdminReconciliation} />
            <Route path="/subscriptions" component={AdminSubscriptions} />
            <Route path="/fees" component={AdminFees} />
            <Route path="/feature-flags" component={AdminFeatureFlags} />
            <Route path="/billing-settings" component={AdminBillingSettings} />
            <Route path="/billing" component={AdminBilling} />
            <Route path="/lottery" component={AdminLottery} />
            <Route path="/rewards/operations" component={AdminRewardsOperations} />
            <Route path="/lottery-dashboard" component={LegacyLotteryDashboardRedirect} />
            <Route path="/billing-audit-report" component={SuperAdminBillingAuditReport} />
            <Route path="/reports" component={AdminReports} />
            <Route path="/settings" component={AdminSettings} />
            <Route path="/profile" component={AdminProfile} />
            <Route path="/service-accounts" component={ServiceAccountsPage} />
            <Route component={NotFound} />
          </Switch>
        </AdminDarkWorkspace>
      </Suspense>
    );
  }

  return <Route component={NotFound} />;
}

function LegacyLotteryDashboardRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/lottery", { replace: true });
  }, [setLocation]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/95 px-5 py-4 shadow-sm">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Loading view</p>
          <p className="text-xs text-muted-foreground">Preparing dashboard modules</p>
        </div>
      </div>
    </div>
  );
}

export default App;
