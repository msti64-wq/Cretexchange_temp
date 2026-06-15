import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { MobileNav } from "@/components/MobileNav";
import { StatCard } from "@/components/StatCard";
import { Users, Search, Filter, CheckCircle, XCircle, Eye, Truck, Building2, UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatCurrency } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

const createAdminSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

const activateMembershipSchema = z.object({
  paymentMethod: z.enum(['stripe', 'cash', 'check', 'bank_transfer', 'waived', 'other']),
  paymentNotes: z.string().optional(),
});

const customPlatformFeeSchema = z.object({
  customPlatformFee: z.string().optional(),
});

const customBillingModelSchema = z.object({
  useCustomBillingModel: z.boolean(),
  customWashoutRate: z.string().optional(),
});

type DriverStripeDebugStatus = {
  userId: string;
  driverId: string | null;
  stripeAccountId: string | null;
  accountExists: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  requirementsEventuallyDue: string[];
  disabledReason: string | null;
  externalAccountsCount: number;
  bankAccountsCount: number;
  onboardingComplete: boolean;
};

function formatDriverStripeDebugArray(values?: string[]) {
  return values?.length ? values.join(", ") : "None";
}

function getDriverStripeDebugSummary(status: DriverStripeDebugStatus) {
  const currentlyDue = status.requirementsCurrentlyDue || [];
  const pastDue = status.requirementsPastDue || [];
  const requiresExternalAccount = currentlyDue.some((field) => field.includes("external_account"));

  if (!status.accountExists) {
    return {
      label: "No Stripe account found",
      message: "No saved Stripe Connect account ID exists for this driver.",
      variant: "secondary" as const,
    };
  }

  if (status.onboardingComplete && status.payoutsEnabled) {
    return {
      label: "Payouts ready",
      message: "Stripe reports this driver can receive payouts.",
      variant: "default" as const,
    };
  }

  if (requiresExternalAccount || status.bankAccountsCount === 0) {
    return {
      label: "Bank account missing",
      message: "Stripe still needs a bank account through secure onboarding.",
      variant: "destructive" as const,
    };
  }

  if (currentlyDue.length > 0 || pastDue.length > 0 || status.disabledReason) {
    return {
      label: "Action required",
      message: "Stripe requires more information before payouts are ready.",
      variant: "destructive" as const,
    };
  }

  return {
    label: "Account exists, onboarding incomplete",
    message: "The connected account exists, but Stripe has not marked payouts ready.",
    variant: "secondary" as const,
  };
}

export default function AdminUsers() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [activationDialogOpen, setActivationDialogOpen] = useState(false);
  const [platformFeeDialogOpen, setPlatformFeeDialogOpen] = useState(false);
  const [customBillingDialogOpen, setCustomBillingDialogOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<any>(null);
  const [stripeDebugDialogOpen, setStripeDebugDialogOpen] = useState(false);
  const [selectedDriverStripeUser, setSelectedDriverStripeUser] = useState<any>(null);
  const [driverStripeDebugStatus, setDriverStripeDebugStatus] = useState<DriverStripeDebugStatus | null>(null);

  const createAdminForm = useForm<z.infer<typeof createAdminSchema>>({
    resolver: zodResolver(createAdminSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      firstName: "",
      lastName: "",
    },
  });

  const activationForm = useForm<z.infer<typeof activateMembershipSchema>>({
    resolver: zodResolver(activateMembershipSchema),
    defaultValues: {
      paymentMethod: 'cash',
      paymentNotes: '',
    },
  });

  const customFeeForm = useForm<z.infer<typeof customPlatformFeeSchema>>({
    resolver: zodResolver(customPlatformFeeSchema),
    defaultValues: {
      customPlatformFee: '',
    },
  });

  const customBillingForm = useForm<z.infer<typeof customBillingModelSchema>>({
    resolver: zodResolver(customBillingModelSchema),
    defaultValues: {
      useCustomBillingModel: false,
      customWashoutRate: '',
    },
  });

  // Function to calculate months on platform
  const calculateMonthsOnPlatform = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const months = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth());
    return months;
  };

  const { data: usersData, isLoading, error } = useQuery({
    queryKey: ['/api/admin/users'],
    retry: false,
  });

  const createAdminMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createAdminSchema>) => {
      const response = await fetch('/api/admin/users/create-admin', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create admin');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Admin user created successfully",
      });
      setIsCreateDialogOpen(false);
      createAdminForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create admin user",
        variant: "destructive",
      });
    },
  });

  const handleCreateAdmin = (data: z.infer<typeof createAdminSchema>) => {
    createAdminMutation.mutate(data);
  };

  const activateMembershipMutation = useMutation({
    mutationFn: async (data: { ownerId: string; paymentMethod: string; paymentNotes?: string }) => {
      const response = await apiRequest("POST", `/api/admin/owners/${data.ownerId}/activate-membership`, {
        paymentMethod: data.paymentMethod,
        paymentNotes: data.paymentNotes,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Membership Activated",
        description: "Owner membership has been activated successfully.",
      });
      setActivationDialogOpen(false);
      setSelectedOwner(null);
      activationForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: "Activation Failed",
        description: error.message || "Failed to activate membership",
        variant: "destructive",
      });
    },
  });

  const handleActivateMembership = (data: z.infer<typeof activateMembershipSchema>) => {
    if (selectedOwner) {
      activateMembershipMutation.mutate({
        ownerId: selectedOwner.id,
        paymentMethod: data.paymentMethod,
        paymentNotes: data.paymentNotes,
      });
    }
  };

  const customPlatformFeeMutation = useMutation({
    mutationFn: async (data: { ownerId: string; customPlatformFee: string | null }) => {
      return await apiRequest("PUT", `/api/admin/owners/${data.ownerId}/platform-fee`, {
        customPlatformFee: data.customPlatformFee,
      });
    },
    onSuccess: () => {
      toast({
        title: "Platform Fee Updated",
        description: "The owner's platform fee per washout has been updated successfully.",
      });
      setPlatformFeeDialogOpen(false);
      setSelectedOwner(null);
      customFeeForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/billing/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update platform fee per washout",
        variant: "destructive",
      });
    },
  });

  const handleUpdateCustomPlatformFee = (data: z.infer<typeof customPlatformFeeSchema>) => {
    if (selectedOwner) {
      const feeInput = data.customPlatformFee ?? "";
      const hasCustomPlatformFee = feeInput !== "";
      const feeValue = hasCustomPlatformFee ? parseFloat(feeInput) : null;
      if (hasCustomPlatformFee && (isNaN(feeValue as number) || (feeValue as number) < 0)) {
        toast({
          title: "Invalid Amount",
          description: "Please enter a valid amount zero or greater, or leave blank to use the global fee",
          variant: "destructive",
        });
        return;
      }
      customPlatformFeeMutation.mutate({
        ownerId: selectedOwner.id,
        customPlatformFee: hasCustomPlatformFee ? feeInput : null,
      });
    }
  };

  const customBillingModelMutation = useMutation({
    mutationFn: async (data: { ownerId: string; useCustomBillingModel: boolean; customWashoutRate: string | null }) => {
      return await apiRequest("PUT", `/api/admin/owners/${data.ownerId}/custom-billing`, {
        useCustomBillingModel: data.useCustomBillingModel,
        customWashoutRate: data.customWashoutRate,
      });
    },
    onSuccess: () => {
      toast({
        title: "Custom Billing Settings Updated",
        description: "The owner's billing model has been updated successfully.",
      });
      setCustomBillingDialogOpen(false);
      setSelectedOwner(null);
      customBillingForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update custom billing settings",
        variant: "destructive",
      });
    },
  });

  const handleUpdateCustomBilling = (data: z.infer<typeof customBillingModelSchema>) => {
    if (selectedOwner) {
      const rateInput = data.customWashoutRate ?? "";
      const hasCustomWashoutRate = rateInput !== "";
      const rateValue = hasCustomWashoutRate ? parseFloat(rateInput) : null;
      if (hasCustomWashoutRate && (isNaN(rateValue as number) || (rateValue as number) < 0)) {
        toast({
          title: "Invalid Rate",
          description: "Please enter a valid rate zero or greater, or leave blank to use the default rate",
          variant: "destructive",
        });
        return;
      }
      customBillingModelMutation.mutate({
        ownerId: selectedOwner.id,
        useCustomBillingModel: data.useCustomBillingModel,
        customWashoutRate: hasCustomWashoutRate ? rateInput : null,
      });
    }
  };

  const driverStripeDebugMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("GET", `/api/admin/debug/driver-stripe/${encodeURIComponent(userId)}`);
      return await response.json() as DriverStripeDebugStatus;
    },
    onSuccess: (data) => {
      setDriverStripeDebugStatus(data);
    },
    onError: (error: any) => {
      setDriverStripeDebugStatus(null);
      toast({
        title: "Stripe Status Check Failed",
        description: error.message || "Unable to retrieve driver Stripe status",
        variant: "destructive",
      });
    },
  });

  const handleCheckDriverStripeStatus = (driverUser: any) => {
    setSelectedDriverStripeUser(driverUser);
    setDriverStripeDebugStatus(null);
    setStripeDebugDialogOpen(true);
    driverStripeDebugMutation.mutate(driverUser.id);
  };

  // Get current user to check if super admin
  const { data: currentUser } = useQuery({
    queryKey: ['/api/auth/user'],
    retry: false,
  });

  // Handle unauthorized error
  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [error, toast]);

  const approveOwnerMutation = useMutation({
    mutationFn: async (ownerId: string) => {
      const response = await apiRequest("PUT", `/api/admin/owners/${ownerId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Owner Approved",
        description: "Owner has been approved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error) => {
      toast({
        title: "Approval Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const response = await apiRequest("PUT", `/api/admin/users/${userId}/status`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "User Status Updated",
        description: "User status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error) => {
      toast({
        title: "Status Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
        <MobileNav role={user?.role} />
      </div>
    );
  }

  const { drivers = [], owners = [], admins = [] } = (usersData as any) || {};
  
  // Combine and filter users
  const allUsers = [
    ...drivers.map((d: any) => ({ ...d.users, roleData: d.drivers, role: 'driver' })),
    ...owners.map((o: any) => ({ ...o.users, roleData: o.owners, role: 'owner' })),
    ...admins.map((a: any) => ({ ...a, roleData: null, role: a.role })) // Keep original role (admin or super_admin)
  ];

  const filteredUsers = allUsers.filter((user: any) => {
    const matchesSearch = 
      user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.roleData?.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.roleData?.employerName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = filterRole === "all" || user.role === filterRole;
    
    const matchesStatus = filterStatus === "all" || 
      (filterStatus === "active" && user.isActive) ||
      (filterStatus === "inactive" && !user.isActive) ||
      (filterStatus === "pending" && user.role === 'owner' && !user.roleData?.isApproved);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const stats = {
    totalUsers: allUsers.length,
    totalDrivers: drivers.length,
    totalOwners: owners.length,
    totalAdmins: admins.length,
    pendingApprovals: owners.filter((o: any) => !o.owners?.isApproved).length,
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">User Management</h1>
              <p className="text-white/80 text-sm">Manage drivers and owners</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard title="Total Users" className="text-center">
            <div className="text-2xl font-bold text-primary" data-testid="text-total-users">
              {stats.totalUsers}
            </div>
            <div className="text-xs text-muted-foreground">Platform Users</div>
          </StatCard>

          <StatCard title="Pending" className="text-center">
            <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-approvals">
              {stats.pendingApprovals}
            </div>
            <div className="text-xs text-muted-foreground">Approvals</div>
          </StatCard>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <StatCard title="Drivers" className="text-center">
            <div className="text-xl font-bold text-secondary" data-testid="text-total-drivers">
              {stats.totalDrivers}
            </div>
            <div className="text-xs text-muted-foreground">Registered</div>
          </StatCard>

          <StatCard title="Owners" className="text-center">
            <div className="text-xl font-bold text-accent" data-testid="text-total-owners">
              {stats.totalOwners}
            </div>
            <div className="text-xs text-muted-foreground">Registered</div>
          </StatCard>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters</span>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-users"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Role</label>
                  <Select value={filterRole} onValueChange={setFilterRole}>
                    <SelectTrigger data-testid="select-filter-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="driver">Drivers</SelectItem>
                      <SelectItem value="owner">Owners</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Status</label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger data-testid="select-filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="pending">Pending Approval</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center">
              <Users className="w-5 h-5 mr-2" />
              Platform Users ({filteredUsers.length})
            </h2>
            
            {/* Create Admin Button - Only for Super Admins */}
            {(currentUser as any)?.role === 'super_admin' && (
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-create-admin">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Create Admin
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create Admin User</DialogTitle>
                  </DialogHeader>
                  
                  <Form {...createAdminForm}>
                    <form onSubmit={createAdminForm.handleSubmit(handleCreateAdmin)} className="space-y-4">
                      <FormField
                        control={createAdminForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter username" {...field} data-testid="input-admin-username" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={createAdminForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="Enter email" {...field} data-testid="input-admin-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={createAdminForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <PasswordInput placeholder="Enter password" {...field} data-testid="input-admin-password" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={createAdminForm.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First Name</FormLabel>
                              <FormControl>
                                <Input placeholder="First name" {...field} data-testid="input-admin-firstname" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={createAdminForm.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Last Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Last name" {...field} data-testid="input-admin-lastname" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsCreateDialogOpen(false)}
                          data-testid="button-cancel-admin"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={createAdminMutation.isPending}
                          data-testid="button-submit-admin"
                        >
                          {createAdminMutation.isPending ? "Creating..." : "Create Admin"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {filteredUsers.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No users found matching your criteria</p>
              </CardContent>
            </Card>
          ) : (
            filteredUsers.map((user: any, index: number) => (
              <Card key={user.id} className="hover:shadow-md transition-shadow" data-testid={`card-user-${index}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start space-x-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        user.role === 'driver' ? 'bg-secondary/10' : (user.role === 'admin' || user.role === 'super_admin') ? 'bg-primary/10' : 'bg-accent/10'
                      }`}>
                        {user.role === 'driver' ? 
                          <Truck className="w-5 h-5 text-secondary" /> :
                          (user.role === 'admin' || user.role === 'super_admin') ?
                          <Users className="w-5 h-5 text-primary" /> :
                          <Building2 className="w-5 h-5 text-accent" />
                        }
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-1" data-testid={`text-user-name-${index}`}>
                          {user.firstName} {user.lastName}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-1" data-testid={`text-user-email-${index}`}>
                          {user.email}
                        </p>
                        {user.role === 'driver' && user.roleData?.employerName && (
                          <p className="text-sm text-muted-foreground" data-testid={`text-employer-${index}`}>
                            Employer: {user.roleData.employerName}
                          </p>
                        )}
                        {user.role === 'owner' && user.roleData?.companyName && (
                          <p className="text-sm text-muted-foreground" data-testid={`text-company-${index}`}>
                            Company: {user.roleData.companyName}
                          </p>
                        )}
                        {user.role === 'owner' && user.roleData?.createdAt && (
                          <p className="text-sm text-muted-foreground mt-1" data-testid={`text-months-platform-${index}`}>
                            <strong>Months on Platform:</strong> {calculateMonthsOnPlatform(user.roleData.createdAt)}
                          </p>
                        )}
                        {user.role === 'owner' && (currentUser as any)?.role === 'super_admin' && (
                          <p className="text-sm text-muted-foreground mt-1" data-testid={`text-platform-fee-${index}`}>
                            <strong>Platform Fee per Washout:</strong> {user.roleData?.customPlatformFee !== null && user.roleData?.customPlatformFee !== undefined ? `$${user.roleData.customPlatformFee} (custom)` : 'Using global fee'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge 
                        variant={user.role === 'driver' ? 'secondary' : (user.role === 'admin' || user.role === 'super_admin') ? 'outline' : 'default'}
                        className="mb-2"
                        data-testid={`badge-user-role-${index}`}
                      >
                        {user.role === 'driver' ? 'Driver' : user.role === 'super_admin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'Owner'}
                      </Badge>
                      <div className="flex flex-col gap-1">
                        <Badge 
                          variant={user.isActive ? 'default' : 'destructive'}
                          className="text-xs"
                          data-testid={`badge-user-status-${index}`}
                        >
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        {user.role === 'owner' && (
                          <Badge 
                            variant={user.roleData?.isApproved ? 'default' : 'secondary'}
                            className="text-xs"
                            data-testid={`badge-approval-status-${index}`}
                          >
                            {user.roleData?.isApproved ? 'Approved' : 'Pending'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="text-sm text-muted-foreground">
                      Joined: {new Date(user.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex gap-2">
                      {user.role === 'owner' && !user.roleData?.isApproved && (
                        (currentUser as any)?.role === 'super_admin' ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedOwner(user.roleData);
                              setActivationDialogOpen(true);
                            }}
                            data-testid={`button-manual-activate-${index}`}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Manual Activate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => approveOwnerMutation.mutate(user.roleData.id)}
                            disabled={approveOwnerMutation.isPending}
                            data-testid={`button-approve-${index}`}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                        )
                      )}
                      {user.role === 'owner' && user.roleData?.isApproved && (currentUser as any)?.role === 'super_admin' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedOwner(user.roleData);
                              customFeeForm.setValue('customPlatformFee', user.roleData?.customPlatformFee !== null && user.roleData?.customPlatformFee !== undefined ? String(user.roleData.customPlatformFee) : '');
                              setPlatformFeeDialogOpen(true);
                            }}
                            data-testid={`button-set-custom-fee-${index}`}
                          >
                            Set Platform Fee
                          </Button>
                          <Button
                            size="sm"
                            variant={user.roleData?.useCustomBillingModel ? "default" : "outline"}
                            onClick={() => {
                              setSelectedOwner(user.roleData);
                              customBillingForm.setValue('useCustomBillingModel', user.roleData?.useCustomBillingModel || false);
                              customBillingForm.setValue('customWashoutRate', user.roleData?.customWashoutRate !== null && user.roleData?.customWashoutRate !== undefined ? String(user.roleData.customWashoutRate) : '');
                              setCustomBillingDialogOpen(true);
                            }}
                            data-testid={`button-custom-billing-${index}`}
                          >
                            {user.roleData?.useCustomBillingModel ? 'Custom Billing Mode' : 'Custom Billing Settings'}
                          </Button>
                        </>
                      )}
                      {user.role === 'driver' && (currentUser as any)?.role === 'super_admin' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCheckDriverStripeStatus(user)}
                          disabled={driverStripeDebugMutation.isPending && selectedDriverStripeUser?.id === user.id}
                          data-testid={`button-check-driver-stripe-status-${index}`}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          {driverStripeDebugMutation.isPending && selectedDriverStripeUser?.id === user.id
                            ? "Checking..."
                            : "Check Driver Stripe Status"}
                        </Button>
                      )}
                      {user.role !== 'super_admin' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleUserStatusMutation.mutate({ 
                            userId: user.id, 
                            isActive: !user.isActive 
                          })}
                          disabled={toggleUserStatusMutation.isPending}
                          data-testid={`button-toggle-status-${index}`}
                        >
                          {user.isActive ? (
                            <>
                              <XCircle className="w-4 h-4 mr-1" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Activate
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>

      {/* Manual Activation Dialog */}
      <Dialog open={activationDialogOpen} onOpenChange={setActivationDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manually Activate Membership</DialogTitle>
          </DialogHeader>
          
          <div className="mb-4 text-sm text-muted-foreground">
            {selectedOwner && (
              <>
                <p className="mb-1">
                  <span className="font-medium">Company:</span> {selectedOwner.companyName}
                </p>
                <p>Use this form to activate an owner who paid the membership fee through an alternative method (cash, check, bank transfer, etc.)</p>
              </>
            )}
          </div>

          <Form {...activationForm}>
            <form onSubmit={activationForm.handleSubmit(handleActivateMembership)} className="space-y-4">
              <FormField
                control={activationForm.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-payment-method">
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="waived">Waived (No Payment)</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={activationForm.control}
                name="paymentNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Add any notes about the payment..." 
                        {...field} 
                        data-testid="input-payment-notes" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setActivationDialogOpen(false);
                    setSelectedOwner(null);
                    activationForm.reset();
                  }}
                  data-testid="button-cancel-activation"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={activateMembershipMutation.isPending}
                  data-testid="button-submit-activation"
                >
                  {activateMembershipMutation.isPending ? "Activating..." : "Activate Membership"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Custom Platform Fee Dialog */}
      <Dialog open={platformFeeDialogOpen} onOpenChange={setPlatformFeeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Platform Fee per Washout</DialogTitle>
          </DialogHeader>
          
          <div className="mb-4 text-sm text-muted-foreground">
            {selectedOwner && (
              <>
                <p className="mb-1">
                  <span className="font-medium">Company:</span> {selectedOwner.companyName}
                </p>
                <p className="mb-2">
                  <span className="font-medium">Months on Platform:</span> {selectedOwner.createdAt && calculateMonthsOnPlatform(selectedOwner.createdAt)}
                </p>
                <p>Set the platform fee per washout for this owner. Leave blank to use the platform default. A superadmin can override this owner rate at the location level. Enter 0.00 to waive the fee.</p>
              </>
            )}
          </div>

          <Form {...customFeeForm}>
            <form onSubmit={customFeeForm.handleSubmit(handleUpdateCustomPlatformFee)} className="space-y-4">
              <FormField
                control={customFeeForm.control}
                name="customPlatformFee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Platform Fee per Washout ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Leave blank to use default $5.00"
                        {...field}
                        data-testid="input-custom-platform-fee"
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground mt-1">
                      Blank uses the platform default. Enter 0.00 to waive the platform fee. Superadmins can override the final rate at the owner or location level.
                    </p>
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPlatformFeeDialogOpen(false)}
                  data-testid="button-cancel-custom-fee"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={customPlatformFeeMutation.isPending}
                  data-testid="button-submit-custom-fee"
                >
                  {customPlatformFeeMutation.isPending ? "Updating..." : "Update Fee"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={stripeDebugDialogOpen}
        onOpenChange={(open) => {
          setStripeDebugDialogOpen(open);
          if (!open) {
            setSelectedDriverStripeUser(null);
            setDriverStripeDebugStatus(null);
            driverStripeDebugMutation.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Driver Stripe Status</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {selectedDriverStripeUser && (
              <div className="text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Driver:</span>{" "}
                  {selectedDriverStripeUser.firstName} {selectedDriverStripeUser.lastName}
                </p>
                <p>
                  <span className="font-medium text-foreground">User ID:</span>{" "}
                  <span data-testid="text-driver-stripe-debug-user-id">{selectedDriverStripeUser.id}</span>
                </p>
              </div>
            )}

            {driverStripeDebugMutation.isPending && (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground" data-testid="text-driver-stripe-debug-loading">
                Checking Stripe status...
              </div>
            )}

            {driverStripeDebugStatus && (() => {
              const summary = getDriverStripeDebugSummary(driverStripeDebugStatus);
              const rows = [
                ["stripeAccountId", driverStripeDebugStatus.stripeAccountId || "None"],
                ["accountExists", driverStripeDebugStatus.accountExists ? "Yes" : "No"],
                ["detailsSubmitted", driverStripeDebugStatus.detailsSubmitted ? "Yes" : "No"],
                ["payoutsEnabled", driverStripeDebugStatus.payoutsEnabled ? "Yes" : "No"],
                ["chargesEnabled", driverStripeDebugStatus.chargesEnabled ? "Yes" : "No"],
                ["externalAccountsCount", String(driverStripeDebugStatus.externalAccountsCount)],
                ["bankAccountsCount", String(driverStripeDebugStatus.bankAccountsCount)],
                ["requirementsCurrentlyDue", formatDriverStripeDebugArray(driverStripeDebugStatus.requirementsCurrentlyDue)],
                ["requirementsPastDue", formatDriverStripeDebugArray(driverStripeDebugStatus.requirementsPastDue)],
                ["disabledReason", driverStripeDebugStatus.disabledReason || "None"],
                ["onboardingComplete", driverStripeDebugStatus.onboardingComplete ? "Yes" : "No"],
              ];

              return (
                <div className="space-y-4" data-testid="panel-driver-stripe-debug-result">
                  <div className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Diagnostic Status</p>
                        <p className="text-sm text-muted-foreground" data-testid="text-driver-stripe-debug-summary">
                          {summary.message}
                        </p>
                      </div>
                      <Badge variant={summary.variant} data-testid="badge-driver-stripe-debug-status">
                        {summary.label}
                      </Badge>
                    </div>
                  </div>

                  <div className="rounded-lg border">
                    {rows.map(([label, value], rowIndex) => (
                      <div
                        key={label}
                        className={`grid grid-cols-1 gap-1 px-4 py-3 text-sm sm:grid-cols-[220px_1fr] ${rowIndex > 0 ? "border-t" : ""}`}
                      >
                        <div className="font-medium text-muted-foreground">{label}</div>
                        <div className="break-words font-mono text-xs sm:text-sm" data-testid={`text-driver-stripe-debug-${label}`}>
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={customBillingDialogOpen} onOpenChange={setCustomBillingDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom Billing Settings</DialogTitle>
          </DialogHeader>
          
          <div className="mb-4 text-sm text-muted-foreground">
            {selectedOwner && (
              <>
                <p className="mb-1">
                  <span className="font-medium">Company:</span> {selectedOwner.companyName}
                </p>
                <p>Enable the custom billing pilot for an owner. This is an admin-controlled setting and does not change owner location tip settings.</p>
              </>
            )}
          </div>

          <Form {...customBillingForm}>
            <form onSubmit={customBillingForm.handleSubmit(handleUpdateCustomBilling)} className="space-y-4">
              <FormField
                control={customBillingForm.control}
                name="useCustomBillingModel"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Custom Billing Model</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Drivers follow the custom billing model instead of cash payout handling
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-use-custom-billing"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={customBillingForm.control}
                name="customWashoutRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Washout Rate ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g., 2.50 or 0.00"
                        {...field}
                        data-testid="input-custom-washout-rate"
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground mt-1">
                      Custom override for the platform rate. Leave blank to use the default rate of $5.00. Enter 0.00 to waive the fee. Superadmins can override the owner or location rate.
                    </p>
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCustomBillingDialogOpen(false)}
                  data-testid="button-cancel-custom-billing"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={customBillingModelMutation.isPending}
                  data-testid="button-submit-custom-billing"
                >
                  {customBillingModelMutation.isPending ? "Updating..." : "Save Settings"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <MobileNav role={user?.role} />
    </div>
  );
}
