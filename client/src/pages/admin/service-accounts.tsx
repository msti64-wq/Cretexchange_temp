import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MobileNav } from "@/components/MobileNav";
import { Plus, Edit, Trash2, Star, CreditCard, DollarSign, Settings, AlertCircle, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { insertServicePaymentAccountSchema } from "@shared/schema";
import { z } from "zod";

// Form schemas
const createAccountSchema = insertServicePaymentAccountSchema;
const updateAccountSchema = insertServicePaymentAccountSchema.partial();

type CreateAccountData = z.infer<typeof createAccountSchema>;
type UpdateAccountData = z.infer<typeof updateAccountSchema>;

interface ServicePaymentAccount {
  id: string;
  name: string;
  description?: string | null;
  stripeAccountId?: string | null;
  stripePublishableKey?: string | null;
  webhookEndpointId?: string | null;
  platformFeePercentage: string;
  processingFeeFlat: string;
  processingFeePercentage: string;
  collectPaymentsFromOwners: boolean;
  autoDistributeToDrivers: boolean;
  distributionFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  minimumPayoutAmount: string;
  isActive: boolean;
  isDefault: boolean;
  totalProcessed: string;
  totalFeesCollected: string;
  lastPayoutAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export default function ServiceAccountsPage() {
  const { toast } = useToast();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ServicePaymentAccount | null>(null);

  const { data: accounts, isLoading, error } = useQuery<ServicePaymentAccount[]>({
    queryKey: ['/api/superadmin/service-accounts'],
    retry: false,
  });

  // Handle unauthorized error
  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Unauthorized",
        description: "You don't have permission to access this page.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [error, toast]);

  // Create account form
  const createForm = useForm<CreateAccountData>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      name: "",
      description: "",
      stripeAccountId: "",
      stripePublishableKey: "",
      webhookEndpointId: "",
      platformFeePercentage: "10.00",
      processingFeeFlat: "0.30",
      processingFeePercentage: "2.90",
      collectPaymentsFromOwners: true,
      autoDistributeToDrivers: true,
      distributionFrequency: "daily",
      minimumPayoutAmount: "5.00",
      isActive: true,
    },
  });

  // Edit account form
  const editForm = useForm<UpdateAccountData>({
    resolver: zodResolver(updateAccountSchema),
  });

  // Create account mutation
  const createAccountMutation = useMutation({
    mutationFn: async (data: CreateAccountData) => {
      const response = await apiRequest("POST", "/api/superadmin/service-accounts", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/service-accounts'] });
      toast({ title: "Service account created successfully" });
      setIsCreateDialogOpen(false);
      createForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create service account", 
        description: error.message || "An error occurred", 
        variant: "destructive" 
      });
    },
  });

  // Update account mutation
  const updateAccountMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateAccountData }) => {
      const response = await apiRequest("PUT", `/api/superadmin/service-accounts/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/service-accounts'] });
      toast({ title: "Service account updated successfully" });
      setEditingAccount(null);
      editForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update service account", 
        description: error.message || "An error occurred", 
        variant: "destructive" 
      });
    },
  });

  // Set default account mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const response = await apiRequest("PUT", `/api/superadmin/service-accounts/${accountId}/set-default`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/service-accounts'] });
      toast({ title: "Default service account updated" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to set default account", 
        description: error.message || "An error occurred", 
        variant: "destructive" 
      });
    },
  });

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const response = await apiRequest("DELETE", `/api/superadmin/service-accounts/${accountId}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/service-accounts'] });
      toast({ title: "Service account deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete account", 
        description: error.message || "An error occurred", 
        variant: "destructive" 
      });
    },
  });

  const handleCreateSubmit = (data: CreateAccountData) => {
    createAccountMutation.mutate(data);
  };

  const handleEditSubmit = (data: UpdateAccountData) => {
    if (!editingAccount) return;
    updateAccountMutation.mutate({ id: editingAccount.id, data });
  };

  const handleEditAccount = (account: ServicePaymentAccount) => {
    setEditingAccount(account);
    editForm.reset({
      name: account.name,
      description: account.description || "",
      stripeAccountId: account.stripeAccountId || "",
      stripePublishableKey: account.stripePublishableKey || "",
      webhookEndpointId: account.webhookEndpointId || "",
      platformFeePercentage: account.platformFeePercentage,
      processingFeeFlat: account.processingFeeFlat,
      processingFeePercentage: account.processingFeePercentage,
      collectPaymentsFromOwners: account.collectPaymentsFromOwners,
      autoDistributeToDrivers: account.autoDistributeToDrivers,
      distributionFrequency: account.distributionFrequency,
      minimumPayoutAmount: account.minimumPayoutAmount,
      isActive: account.isActive,
    });
  };

  const handleSetDefault = (accountId: string) => {
    setDefaultMutation.mutate(accountId);
  };

  const handleDeleteAccount = (accountId: string, isDefault: boolean) => {
    if (isDefault) {
      toast({ 
        title: "Cannot delete default account", 
        description: "Set another account as default first", 
        variant: "destructive" 
      });
      return;
    }
    
    if (confirm("Are you sure you want to delete this service account? This action cannot be undone.")) {
      deleteAccountMutation.mutate(accountId);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading service accounts...</p>
          </div>
        </div>
        <MobileNav role="admin" />
      </div>
    );
  }

  if (error && !isUnauthorizedError(error as Error)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load service accounts. Please try again later.
          </AlertDescription>
        </Alert>
        <MobileNav role="admin" />
      </div>
    );
  }

  const defaultAccount = accounts?.find((account: ServicePaymentAccount) => account.isDefault);

  return (
    <div className="container mx-auto px-4 py-8 pb-24">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">Service Payment Accounts</h1>
          <p className="text-muted-foreground">Manage payment processing configurations for the platform</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-account">
              <Plus className="w-4 h-4 mr-2" />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Service Account</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Primary Payment Account" {...field} data-testid="input-account-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional description" {...field} value={field.value || ""} data-testid="input-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="stripeAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stripe Account ID</FormLabel>
                        <FormControl>
                          <Input placeholder="acct_..." {...field} value={field.value || ""} data-testid="input-stripe-account-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="stripePublishableKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stripe Publishable Key</FormLabel>
                        <FormControl>
                          <Input placeholder="pk_..." {...field} value={field.value || ""} data-testid="input-stripe-publishable-key" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Fee Structure</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
                      name="platformFeePercentage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Platform Fee (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0" max="100" {...field} value={field.value || ""} data-testid="input-platform-fee-percentage" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="processingFeeFlat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Platform Fee (Fixed $)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0" {...field} value={field.value || ""} data-testid="input-processing-fee-flat" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="processingFeePercentage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Driver Payment Fee (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0" max="100" {...field} value={field.value || ""} data-testid="input-processing-fee-percentage" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="minimumPayoutAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimum Payout Amount ($)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0.01" {...field} value={field.value || ""} data-testid="input-minimum-payout-amount" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Payment Settings</h3>
                  <FormField
                    control={createForm.control}
                    name="distributionFrequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Distribution Frequency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "daily"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-distribution-frequency">
                              <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="biweekly">Bi-weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="space-y-3">
                    <h4 className="font-medium">Payment Collection Settings</h4>
                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={createForm.control}
                        name="collectPaymentsFromOwners"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <Switch
                                checked={field.value ?? true}
                                onCheckedChange={field.onChange}
                                data-testid="switch-collect-payments-from-owners"
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              Collect Payments from Owners
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="autoDistributeToDrivers"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <Switch
                                checked={field.value ?? true}
                                onCheckedChange={field.onChange}
                                data-testid="switch-auto-distribute-to-drivers"
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              Auto-distribute to Drivers
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <FormField
                    control={createForm.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Switch
                            checked={field.value ?? true}
                            onCheckedChange={field.onChange}
                            data-testid="switch-is-active"
                          />
                        </FormControl>
                        <FormLabel className="text-sm font-normal">
                          Account Active
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)} data-testid="button-cancel-create">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createAccountMutation.isPending} data-testid="button-submit-create">
                    {createAccountMutation.isPending ? "Creating..." : "Create Account"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Default Account Summary */}
      {defaultAccount && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Star className="w-5 h-5 mr-2 text-yellow-500" />
              Default Service Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Account Name</p>
                <p className="font-semibold" data-testid="text-default-account-name">{defaultAccount.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Processed</p>
                <p className="font-semibold text-green-600" data-testid="text-default-total-processed">
                  {formatCurrency(parseFloat(defaultAccount.totalProcessed))}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Fees Collected</p>
                <p className="font-semibold text-blue-600" data-testid="text-default-fees-collected">
                  {formatCurrency(parseFloat(defaultAccount.totalFeesCollected))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Service Accounts List */}
      <div className="grid gap-6">
        {accounts?.map((account: ServicePaymentAccount) => (
          <Card key={account.id} className={account.isDefault ? "border-yellow-200 bg-yellow-50/50" : ""}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-2">
                  <CardTitle className="flex items-center">
                    <CreditCard className="w-5 h-5 mr-2" />
                    {account.name}
                  </CardTitle>
                  <div className="flex space-x-1">
                    {account.isDefault && (
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800" data-testid={`badge-default-${account.id}`}>
                        <Star className="w-3 h-3 mr-1" />
                        Default
                      </Badge>
                    )}
                    <Badge variant={account.isActive ? "default" : "secondary"} data-testid={`badge-status-${account.id}`}>
                      {account.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
                <div className="flex space-x-2">
                  {!account.isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetDefault(account.id)}
                      disabled={setDefaultMutation.isPending}
                      data-testid={`button-set-default-${account.id}`}
                    >
                      <Star className="w-4 h-4 mr-1" />
                      Set Default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditAccount(account)}
                    data-testid={`button-edit-${account.id}`}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteAccount(account.id, account.isDefault)}
                    disabled={deleteAccountMutation.isPending}
                    data-testid={`button-delete-${account.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Stripe Account</p>
                  <p className="font-mono text-sm" data-testid={`text-stripe-account-${account.id}`}>
                    {account.stripeAccountId || "Not configured"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Platform Fee</p>
                  <p className="font-semibold" data-testid={`text-platform-fee-${account.id}`}>
                    {parseFloat(account.platformFeePercentage)}% 
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Processing Fee</p>
                  <p className="font-semibold" data-testid={`text-processing-fee-${account.id}`}>
                    {parseFloat(account.processingFeePercentage)}% + {formatCurrency(parseFloat(account.processingFeeFlat))}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Distribution</p>
                  <p className="font-semibold capitalize" data-testid={`text-distribution-${account.id}`}>
                    {account.distributionFrequency}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Processed</p>
                  <p className="font-semibold text-green-600" data-testid={`text-total-processed-${account.id}`}>
                    {formatCurrency(parseFloat(account.totalProcessed))}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fees Collected</p>
                  <p className="font-semibold text-blue-600" data-testid={`text-fees-collected-${account.id}`}>
                    {formatCurrency(parseFloat(account.totalFeesCollected))}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Payout</p>
                  <p className="font-semibold" data-testid={`text-last-payout-${account.id}`}>
                    {account.lastPayoutAt 
                      ? new Date(account.lastPayoutAt).toLocaleDateString()
                      : "Never"
                    }
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Minimum Payout</p>
                  <p className="font-semibold" data-testid={`text-minimum-payout-${account.id}`}>
                    {formatCurrency(parseFloat(account.minimumPayoutAmount))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Account Dialog */}
      <Dialog open={!!editingAccount} onOpenChange={() => setEditingAccount(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Service Account</DialogTitle>
          </DialogHeader>
          {editingAccount && (
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Primary Payment Account" {...field} data-testid="input-edit-account-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional description" {...field} value={field.value || ""} data-testid="input-edit-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="stripeAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stripe Account ID</FormLabel>
                        <FormControl>
                          <Input placeholder="acct_..." {...field} value={field.value || ""} data-testid="input-edit-stripe-account-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="stripePublishableKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stripe Publishable Key</FormLabel>
                        <FormControl>
                          <Input placeholder="pk_..." {...field} value={field.value || ""} data-testid="input-edit-stripe-publishable-key" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Fee Structure</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="platformFeePercentage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Platform Fee (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0" max="100" {...field} value={field.value || ""} data-testid="input-edit-platform-fee-percentage" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="processingFeeFlat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Platform Fee (Fixed $)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0" {...field} value={field.value || ""} data-testid="input-edit-processing-fee-flat" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="processingFeePercentage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Driver Payment Fee (%)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0" max="100" {...field} value={field.value || ""} data-testid="input-edit-processing-fee-percentage" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="minimumPayoutAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimum Payout Amount ($)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" min="0.01" {...field} value={field.value || ""} data-testid="input-edit-minimum-payout-amount" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Payment Settings</h3>
                  <FormField
                    control={editForm.control}
                    name="distributionFrequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Distribution Frequency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || "daily"}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-distribution-frequency">
                              <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="biweekly">Bi-weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="space-y-3">
                    <h4 className="font-medium">Payment Collection Settings</h4>
                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={editForm.control}
                        name="collectPaymentsFromOwners"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <Switch
                                checked={field.value ?? true}
                                onCheckedChange={field.onChange}
                                data-testid="switch-edit-collect-payments-from-owners"
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              Collect Payments from Owners
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editForm.control}
                        name="autoDistributeToDrivers"
                        render={({ field }) => (
                          <FormItem className="flex items-center space-x-2">
                            <FormControl>
                              <Switch
                                checked={field.value ?? true}
                                onCheckedChange={field.onChange}
                                data-testid="switch-edit-auto-distribute-to-drivers"
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              Auto-distribute to Drivers
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <FormField
                    control={editForm.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Switch
                            checked={field.value ?? true}
                            onCheckedChange={field.onChange}
                            data-testid="switch-edit-is-active"
                          />
                        </FormControl>
                        <FormLabel className="text-sm font-normal">
                          Account Active
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setEditingAccount(null)} data-testid="button-cancel-edit">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateAccountMutation.isPending} data-testid="button-submit-edit">
                    {updateAccountMutation.isPending ? "Updating..." : "Update Account"}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <MobileNav role="admin" />
    </div>
  );
}