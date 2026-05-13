import { Switch, Route, RouteComponentProps } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import ResetPassword from "@/pages/auth/reset-password";
import OldRegister from "@/pages/register";
import PrivacyPolicy from "@/pages/privacy-policy";

// Driver pages
import DriverDashboard from "@/pages/driver/dashboard";
import DriverLocations from "@/pages/driver/locations";
import DriverActivity from "@/pages/driver/activity";
import DriverProfile from "@/pages/driver/profile";
import DriverCheckIn from "@/pages/driver/check-in";
import DriverWallet from "@/pages/driver/wallet";
import DriverNotifications from "@/pages/driver/notifications";

// Owner pages
import OwnerDashboard from "@/pages/owner/dashboard";
import OwnerLocations from "@/pages/owner/locations";
import OwnerDrivers from "@/pages/owner/drivers";
import OwnerPayments from "@/pages/owner/payments";
import OwnerProfile from "@/pages/owner/profile";
import OwnerSubscribe from "@/pages/owner/subscribe";
import OwnerPaymentMethods from "@/pages/owner/payment-methods";
import OwnerWallet from "@/pages/owner/wallet";
import OwnerNotifications from "@/pages/owner/notifications";

// Admin pages
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminLocations from "@/pages/admin/locations";
import AdminPayments from "@/pages/admin/payments";
import AdminSubscriptions from "@/pages/admin/subscriptions";
import AdminFees from "@/pages/admin/fees";
import AdminProfile from "@/pages/admin/profile";
import ServiceAccountsPage from "@/pages/admin/service-accounts";
import AdminFeatureFlags from "@/pages/admin/feature-flags";
import AdminSettings from "@/pages/admin/settings";
import AdminBatchPayments from "@/pages/admin/batch-payments";
import AdminReconciliation from "@/pages/admin/reconciliation";
import AdminBillingSettings from "@/pages/admin/billing-settings";
import AdminLottery from "@/pages/admin/lottery";
import SuperAdminLotteryDashboard from "@/pages/super-admin/lottery-dashboard";

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
    );
  }

  // If user is authenticated but doesn't have a role, show old registration
  if (!(user as any).role) {
    return (
      <Switch>
        <Route path="/" component={OldRegister} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // Role-based routing
  if ((user as any).role === 'driver') {
    return (
      <Switch>
        <Route path="/" component={DriverDashboard} />
        <Route path="/locations" component={DriverLocations} />
        <Route path="/activity" component={DriverActivity} />
        <Route path="/wallet" component={DriverWallet} />
        <Route path="/notifications" component={DriverNotifications} />
        <Route path="/profile" component={DriverProfile} />
        <Route path="/check-in/:locationId?" component={DriverCheckIn} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  if ((user as any).role === 'owner') {
    return (
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
        <Route component={NotFound} />
      </Switch>
    );
  }

  if ((user as any).role === 'admin' || (user as any).role === 'super_admin') {
    return (
      <Switch>
        <Route path="/" component={AdminDashboard} />
        <Route path="/users" component={AdminUsers} />
        <Route path="/locations" component={AdminLocations} />
        <Route path="/payments" component={AdminPayments} />
        <Route path="/batch-payments" component={AdminBatchPayments} />
        <Route path="/reconciliation" component={AdminReconciliation} />
        <Route path="/subscriptions" component={AdminSubscriptions} />
        <Route path="/fees" component={AdminFees} />
        <Route path="/feature-flags" component={AdminFeatureFlags} />
        <Route path="/billing-settings" component={AdminBillingSettings} />
        <Route path="/lottery" component={AdminLottery} />
        <Route path="/lottery-dashboard" component={SuperAdminLotteryDashboard} />
        <Route path="/settings" component={AdminSettings} />
        <Route path="/profile" component={AdminProfile} />
        <Route path="/service-accounts" component={ServiceAccountsPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return <Route component={NotFound} />;
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

export default App;
