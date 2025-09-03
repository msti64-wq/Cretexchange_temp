import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import OldRegister from "@/pages/register";
import Setup from "@/pages/setup";

// Driver pages
import DriverDashboard from "@/pages/driver/dashboard";
import DriverLocations from "@/pages/driver/locations";
import DriverActivity from "@/pages/driver/activity";
import DriverProfile from "@/pages/driver/profile";
import DriverCheckIn from "@/pages/driver/check-in";

// Owner pages
import OwnerDashboard from "@/pages/owner/dashboard";
import OwnerLocations from "@/pages/owner/locations";
import OwnerDrivers from "@/pages/owner/drivers";
import OwnerPayments from "@/pages/owner/payments";
import OwnerProfile from "@/pages/owner/profile";
import OwnerSubscribe from "@/pages/owner/subscribe";

// Admin pages
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminLocations from "@/pages/admin/locations";
import AdminPayments from "@/pages/admin/payments";

function Router() {
  const { user, isLoading, isAuthenticated } = useAuth();

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
        <Route path="/register" component={Register} />
        <Route path="/setup" component={Setup} />
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
        <Route path="/profile" component={OwnerProfile} />
        <Route path="/subscribe" component={OwnerSubscribe} />
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
