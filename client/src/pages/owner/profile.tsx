import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { MobileNav } from "@/components/MobileNav";
import { Building2, CreditCard, Save, LogOut, AlertCircle, Crown, Lock, Eye, EyeOff, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import StripeVerificationStatus from "@/components/StripeVerificationStatus";

export default function OwnerProfile() {
  const { toast } = useToast();
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ['/api/auth/user'],
  });

  // Fetch Stripe requirements
  const { data: stripeRequirements, refetch: refetchStripeRequirements } = useQuery({
    queryKey: ['/api/owners/stripe-requirements'],
    enabled: !!user,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PUT", "/api/owners/profile", data);
    },
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
      setIsEditing(false);
      refetch();
      // Also invalidate owner dashboard data so profile completion notices update
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", "/api/auth/change-password", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been successfully updated.",
      });
      setShowChangePassword(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (error: any) => {
      toast({
        title: "Password Change Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const stripeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/owners/stripe-onboarding");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.onboardingComplete) {
        toast({
          title: "Onboarding Complete",
          description: data.message,
        });
        refetchStripeRequirements();
      } else if (data.onboardingUrl) {
        // Redirect to Stripe onboarding
        window.location.href = data.onboardingUrl;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Onboarding Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Account Link mutation for T&C acceptance (Express accounts)
  const accountLinkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/account-link", {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.accountSetupLink) {
        // Redirect to Stripe Account Link for T&C acceptance
        window.location.href = data.accountSetupLink;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate account link. Please ensure your profile is complete.",
        variant: "destructive",
      });
    },
  });

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    paymentMethod: "ach",
    companyName: "",
    businessLicense: "",
    taxId: "",
    dateOfBirth: "",
    ssnLast4: "",
    businessWebsite: "",
  });

  // Update form data when user data loads
  useEffect(() => {
    if (user && user.roleData) {
      setFormData({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phone: user.phone || "",
        street: user.street || "",
        city: user.city || "",
        state: user.state || "",
        zip: user.zip || "",
        paymentMethod: user.paymentMethod || "ach",
        companyName: user.roleData.companyName || "",
        businessLicense: user.roleData.businessLicense || "",
        taxId: user.roleData.taxId || "",
        dateOfBirth: user.roleData.dateOfBirth || "",
        ssnLast4: user.roleData.ssnLast4 || "",
        businessWebsite: user.roleData.businessWebsite || "",
      });
    }
  }, [user]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  const handleLogout = () => {
    logout();
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "New password and confirmation password don't match.",
        variant: "destructive",
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="animate-pulse space-y-4 p-4">
          <div className="h-20 bg-muted rounded-lg" />
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-48 bg-muted rounded-lg" />
        </div>
        <MobileNav role="owner" />
      </div>
    );
  }

  const owner = user?.roleData;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg" data-testid="text-user-name">
                {user?.firstName} {user?.lastName}
              </h1>
              <p className="text-white/80 text-sm">Location Owner</p>
            </div>
          </div>
          <Button 
            size="sm"
            onClick={handleLogout}
            className="bg-slate-800 hover:bg-slate-700 text-white"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-1" />
            Logout
          </Button>
        </div>
      </header>
      
      <div className="p-4 space-y-4">
        {/* Account Status */}
        <Card>
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center mb-4">
              {owner?.isApproved ? (
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <Crown className="w-8 h-8 text-green-600" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-yellow-600" />
                </div>
              )}
            </div>
            <h2 className="text-xl font-semibold mb-2">
              Account Status
            </h2>
            <Badge 
              variant={owner?.isApproved ? "default" : "secondary"}
              className="mb-4"
              data-testid="badge-approval-status"
            >
              {owner?.isApproved ? 'Approved' : 'Pending Approval'}
            </Badge>
            
            {!owner?.isApproved && (
              <div className="text-sm text-muted-foreground mb-4">
                Your account is pending admin approval. You can add locations after approval.
              </div>
            )}

            <Badge 
              variant={owner?.isApproved ? "default" : "secondary"}
              data-testid="badge-membership-status"
            >
              Membership: {owner?.isApproved ? 'Active' : 'Pending Payment'}
            </Badge>
            
            {!owner?.isApproved && (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Complete your one-time $15.00 membership payment to activate your account.
                </p>
                <Button 
                  onClick={() => setLocation('/subscribe')}
                  data-testid="button-pay-membership"
                >
                  Pay Membership Fee
                </Button>
              </div>
            )}
            
            {owner?.isApproved && (
              <p className="text-sm text-muted-foreground mt-4">
                $1.00/month per active location is automatically deducted from your Column wallet.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Stripe Verification Status */}
        <StripeVerificationStatus userRole="owner" />

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-center">
                <div className="flex items-center justify-center mb-3">
                  <Building2 className="w-5 h-5 mr-2" />
                  Personal Information
                </div>
                <div className="flex justify-center">
                  <Button 
                    type="button"
                    variant={isEditing ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                    data-testid="button-edit-profile"
                  >
                    {isEditing ? "Cancel" : "Edit"}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-first-name"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-last-name"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-email"
                />
              </div>
              
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-phone"
                />
              </div>
              
              <div>
                <Label htmlFor="street">Street Address</Label>
                <Input
                  id="street"
                  value={formData.street}
                  onChange={(e) => setFormData({...formData, street: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-street"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({...formData, city: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-city"
                  />
                </div>

                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({...formData, state: e.target.value})}
                    disabled={!isEditing}
                    maxLength={2}
                    data-testid="input-state"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="zip">ZIP Code</Label>
                <Input
                  id="zip"
                  value={formData.zip}
                  onChange={(e) => setFormData({...formData, zip: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-zip"
                />
              </div>
            </CardContent>
          </Card>

          {/* Stripe Verification Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="w-5 h-5 mr-2" />
                Stripe Verification Information
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Required for Stripe Connect account verification
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  This information is securely sent to Stripe for account verification only. It's never stored or shared elsewhere.
                </p>
              </div>

              <div>
                <Label htmlFor="dateOfBirth">Date of Birth (Required)</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({...formData, dateOfBirth: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-date-of-birth"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Stripe verification requirement (YYYY-MM-DD format)
                </p>
              </div>

              <div>
                <Label htmlFor="ssnLast4">Last 4 Digits of SSN (Required)</Label>
                <Input
                  id="ssnLast4"
                  type="text"
                  placeholder="1234"
                  value={formData.ssnLast4}
                  onChange={(e) => setFormData({...formData, ssnLast4: e.target.value.slice(0, 4)})}
                  disabled={!isEditing}
                  maxLength={4}
                  data-testid="input-ssn-last4"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Only last 4 digits required for security
                </p>
              </div>

              <div>
                <Label htmlFor="businessWebsite">Business Website (Required)</Label>
                <Input
                  id="businessWebsite"
                  type="url"
                  placeholder="https://example.com"
                  value={formData.businessWebsite}
                  onChange={(e) => setFormData({...formData, businessWebsite: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-business-website"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Your business website for Stripe verification
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Lock className="w-5 h-5 mr-2" />
                  Security Settings
                </div>
                <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
                  <DialogTrigger asChild>
                    <Button className="bg-slate-800 hover:bg-slate-900 text-white" size="sm" data-testid="button-change-password">
                      Change Password
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Change Password</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                      <div>
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <div className="relative">
                          <Input
                            id="currentPassword"
                            type={showCurrentPassword ? "text" : "password"}
                            value={passwordData.currentPassword}
                            onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                            required
                            data-testid="input-current-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          >
                            {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="newPassword">New Password</Label>
                        <div className="relative">
                          <Input
                            id="newPassword"
                            type={showNewPassword ? "text" : "password"}
                            value={passwordData.newPassword}
                            onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                            required
                            minLength={6}
                            data-testid="input-new-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                          >
                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Must be at least 6 characters long
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <div className="relative">
                          <Input
                            id="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            value={passwordData.confirmPassword}
                            onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                            required
                            data-testid="input-confirm-password"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>

                      <div className="flex justify-end space-x-2 pt-4">
                        <Button 
                          type="button" 
                          variant="outline"
                          onClick={() => {
                            setShowChangePassword(false);
                            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                          }}
                          data-testid="button-cancel-password"
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit"
                          disabled={changePasswordMutation.isPending}
                          data-testid="button-save-password"
                        >
                          {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                <p>Keep your account secure by using a strong password.</p>
                <p className="mt-1">Last updated: Never</p>
              </div>
            </CardContent>
          </Card>

          {/* Business Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building2 className="w-5 h-5 mr-2" />
                Business Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-company-name"
                />
              </div>
              
              <div>
                <Label htmlFor="businessLicense">Business License Number</Label>
                <Input
                  id="businessLicense"
                  value={formData.businessLicense}
                  onChange={(e) => setFormData({...formData, businessLicense: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-business-license"
                />
              </div>
              
              <div>
                <Label htmlFor="taxId">Tax ID</Label>
                <Input
                  id="taxId"
                  value={formData.taxId}
                  onChange={(e) => setFormData({...formData, taxId: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-tax-id"
                />
              </div>
            </CardContent>
          </Card>

          {/* Payment Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="w-5 h-5 mr-2" />
                Payment Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="paymentMethod">Payment Method for Drivers</Label>
                <Select 
                  value={formData.paymentMethod}
                  onValueChange={(value) => setFormData({...formData, paymentMethod: value})}
                  disabled={!isEditing}
                >
                  <SelectTrigger data-testid="select-payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ach">ACH Transfer</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  How you will pay drivers for completed washouts
                </p>
              </div>
            </CardContent>
          </Card>

          {isEditing && (
            <Button 
              type="submit" 
              className="w-full"
              disabled={updateProfileMutation.isPending}
              data-testid="button-save-profile"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </form>
      </div>

      <MobileNav role="owner" />
    </div>
  );
}
