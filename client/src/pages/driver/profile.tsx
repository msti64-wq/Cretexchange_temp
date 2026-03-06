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
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { DriverTermsDialog } from "@/components/DriverTermsDialog";
import { BankAccountConnect } from "@/components/BankAccountConnect";
import { User, Truck, CreditCard, Save, FileText, Eye, Smartphone, CheckCircle2, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { InstallPrompt } from "@/components/InstallPrompt";
import StripeVerificationStatus from "@/components/StripeVerificationStatus";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FEATURE_FLAGS } from "@shared/featureFlags";

export default function DriverProfile() {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ['/api/auth/user'],
  });

  // Fetch driver terms status
  const { data: termsStatus } = useQuery<{hasAgreed: boolean; agreedAt: string | null}>({
    queryKey: ['/api/drivers/terms-status'],
  });

  const { enabled: waiveDriverPayment } = useFeatureFlag(FEATURE_FLAGS.WAIVE_DRIVER_PAYMENT);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PUT", "/api/drivers/profile", data);
    },
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
      setIsEditing(false);
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
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
    employerName: "",
    employerStreet: "",
    employerCity: "",
    employerState: "",
    employerZip: "",
    employerPhone: "",
    truckNumber: "",
    bankName: "",
    routingNumber: "",
    accountNumber: "",
    accountType: "checking",
    dateOfBirth: "",
    ssnLast4: "",
    businessWebsite: "",
  });

  // Account Link mutation for T&C acceptance
  const accountLinkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/account-link", {});
      const data = await response.json();
      if (!response.ok) {
        // Include detailed error info from server
        const errorMsg = data.stripeError || data.details || data.message || "Unknown error";
        throw new Error(`${errorMsg} (Code: ${data.code || 'N/A'})`);
      }
      return data;
    },
    onSuccess: (data) => {
      if (data.accountSetupLink) {
        // Redirect to Stripe Account Link for T&C acceptance
        window.location.href = data.accountSetupLink;
      }
    },
    onError: (error: any) => {
      console.error("Account Link Error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate account link. Please ensure your profile is complete.",
        variant: "destructive",
      });
    },
  });

  // Update form data when user data loads
  useEffect(() => {
    if (user && (user as any).roleData) {
      const userData = user as any;
      setFormData({
        firstName: userData.firstName || "",
        lastName: userData.lastName || "",
        email: userData.email || "",
        phone: userData.phone || "",
        street: userData.street || "",
        city: userData.city || "",
        state: userData.state || "",
        zip: userData.zip || "",
        employerName: userData.roleData.employerName || "",
        employerStreet: userData.roleData.employerStreet || "",
        employerCity: userData.roleData.employerCity || "",
        employerState: userData.roleData.employerState || "",
        employerZip: userData.roleData.employerZip || "",
        employerPhone: userData.roleData.employerPhone || "",
        truckNumber: userData.roleData.truckNumber || "",
        bankName: userData.roleData.bankName || "",
        routingNumber: "", // Never populate from database for security
        accountNumber: "", // Never populate from database for security
        accountType: "checking",
        dateOfBirth: userData.roleData.dateOfBirth || "",
        ssnLast4: userData.roleData.ssnLast4 || "",
        businessWebsite: userData.roleData.businessWebsite || "",
      });
    }
  }, [user]);

  // Check if profile is complete and show install prompt for first-time completion
  useEffect(() => {
    if (user && termsStatus && !isEditing) {
      const userData = user as any;
      const roleData = userData.roleData || {};
      
      // Profile completion criteria
      const isProfileComplete = Boolean(
        userData.phone &&
        userData.street &&
        userData.city &&
        userData.state &&
        userData.zip &&
        roleData.employerName &&
        roleData.truckNumber &&
        termsStatus.hasAgreed
      );
      
      // Only show install prompt if profile was just completed
      // Check if this is first time being complete by seeing if essential fields were just filled
      const hasEssentialInfo = Boolean(
        userData.phone && userData.street && userData.city && userData.state && userData.zip && roleData.employerName && roleData.truckNumber
      );
      
      console.log('🔍 Profile completion check:', {
        isProfileComplete,
        hasEssentialInfo,
        termsAgreed: termsStatus.hasAgreed,
        showInstallPrompt
      });
      
      if (isProfileComplete && hasEssentialInfo && !showInstallPrompt) {
        // Small delay to ensure profile save completed before showing prompt
        const timer = setTimeout(() => {
          console.log('✅ Profile complete! Showing install prompt...');
          setShowInstallPrompt(true);
        }, 1500);
        
        return () => clearTimeout(timer);
      }
    }
  }, [user, termsStatus, isEditing, showInstallPrompt]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };


  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DriverHeader />
        <div className="animate-pulse p-4 space-y-4">
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-48 bg-muted rounded-lg" />
          <div className="h-48 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <DriverHeader />
      
      <div className="p-4 space-y-4">
        {/* Profile Header */}
        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-1" data-testid="text-user-name">
              {(user as any)?.firstName} {(user as any)?.lastName}
            </h2>
            <p className="text-muted-foreground" data-testid="text-user-role">Concrete Truck Driver</p>
            <div className="flex justify-center gap-2 mt-4 flex-wrap">
              <Button 
                variant={isEditing ? "default" : "outline"}
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                data-testid="button-edit-profile"
              >
                {isEditing ? "Cancel" : "Edit Profile"}
              </Button>
              <Button 
                variant="secondary"
                size="sm"
                onClick={() => accountLinkMutation.mutate()}
                disabled={accountLinkMutation.isPending}
                data-testid="button-accept-terms"
              >
                {accountLinkMutation.isPending ? "Loading..." : "Accept Terms & Conditions"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stripe Verification Status */}
        <StripeVerificationStatus userRole="driver" />

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="w-5 h-5 mr-2" />
                Personal Information
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

              <div>
                <Label htmlFor="dateOfBirth">Date of Birth (Required for Stripe)</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData({...formData, dateOfBirth: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-date-of-birth"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Needed for Stripe verification (YYYY-MM-DD format)
                </p>
              </div>

              <div>
                <Label htmlFor="ssnLast4">Last 4 Digits of SSN (Required for Stripe)</Label>
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
                <Label htmlFor="businessWebsite">Business Website (Required for Stripe)</Label>
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
                  Your business website URL for Stripe verification
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Employment Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Truck className="w-5 h-5 mr-2" />
                Employment Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="employerName">Employer Name</Label>
                <Input
                  id="employerName"
                  value={formData.employerName}
                  onChange={(e) => setFormData({...formData, employerName: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-employer-name"
                />
              </div>
              
              <div>
                <Label htmlFor="employerStreet">Employer Street Address</Label>
                <Input
                  id="employerStreet"
                  value={formData.employerStreet}
                  onChange={(e) => setFormData({...formData, employerStreet: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-employer-street"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="employerCity">Employer City</Label>
                  <Input
                    id="employerCity"
                    value={formData.employerCity}
                    onChange={(e) => setFormData({...formData, employerCity: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-employer-city"
                  />
                </div>

                <div>
                  <Label htmlFor="employerState">Employer State</Label>
                  <Input
                    id="employerState"
                    value={formData.employerState}
                    onChange={(e) => setFormData({...formData, employerState: e.target.value})}
                    disabled={!isEditing}
                    maxLength={2}
                    data-testid="input-employer-state"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="employerZip">Employer ZIP Code</Label>
                <Input
                  id="employerZip"
                  value={formData.employerZip}
                  onChange={(e) => setFormData({...formData, employerZip: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-employer-zip"
                />
              </div>
              
              <div>
                <Label htmlFor="employerPhone">Employer Phone</Label>
                <Input
                  id="employerPhone"
                  value={formData.employerPhone}
                  onChange={(e) => setFormData({...formData, employerPhone: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-employer-phone"
                />
              </div>
              
              <div>
                <Label htmlFor="truckNumber">Truck Number</Label>
                <Input
                  id="truckNumber"
                  placeholder="e.g., Truck #123, Unit A5"
                  value={formData.truckNumber}
                  onChange={(e) => setFormData({...formData, truckNumber: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-truck-number"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter your current truck number or unit identifier
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Payment Account Setup */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="w-5 h-5 mr-2" />
                Payment Account Setup
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Add your bank account to receive washout payments via ACH transfer
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Trial mode notice */}
              {waiveDriverPayment && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg">
                  <div className="w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-bold">T</span>
                  </div>
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">Trial Mode Active</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
                      Bank account setup is optional during the trial. You can connect it now or set it up later before payouts go live.
                    </p>
                  </div>
                </div>
              )}

              {user?.roleData?.hasAccountNumber && user?.roleData?.hasRoutingNumber ? (
                <>
                  <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-green-900 dark:text-green-100">
                        Bank Account Connected
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                        {user?.roleData?.bankName || 'Your bank'} {user?.roleData?.accountNumberLast4 && `****${user?.roleData?.accountNumberLast4}`}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>Ready to Receive Payments:</strong> Washout payments will be transferred to your bank account automatically after each job. Visit your Wallet page to view payment history.
                    </p>
                  </div>
                </>
              ) : waiveDriverPayment ? (
                <>
                  <div className="flex items-center gap-3 p-4 bg-muted/50 border rounded-lg">
                    <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        Bank Account Not Connected
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Optional during trial — connect anytime to be ready when payouts go live
                      </p>
                    </div>
                  </div>

                  <BankAccountConnect
                    userType="driver"
                    onSuccess={() => refetch()}
                    buttonText="Connect Bank Account (Optional)"
                    className="w-full"
                  />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-orange-900 dark:text-orange-100">
                        Bank Account Required
                      </p>
                      <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                        Connect your bank account to receive washout payments
                      </p>
                    </div>
                  </div>

                  <BankAccountConnect
                    userType="driver"
                    onSuccess={() => refetch()}
                    buttonText="Connect Bank Account"
                    className="w-full"
                  />

                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">
                      <strong>🔒 Instant & Secure:</strong> Connect your bank account securely in seconds using your online banking credentials. We use bank-level encryption and never store your banking passwords.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* App Settings Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                App Installation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Install CreteXchange</p>
                  <p className="text-xs text-muted-foreground">
                    Add to your home screen for quick access while on the road
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    localStorage.removeItem('pwaInstallDismissed');
                    setShowInstallPrompt(true);
                  }}
                  data-testid="button-install-app-manual"
                >
                  <Smartphone className="w-4 h-4 mr-2" />
                  Install App
                </Button>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Installing the app provides offline access, faster loading, and a native app experience.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Terms & Conditions Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Terms & Conditions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Driver Terms Agreement</p>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={termsStatus?.hasAgreed ? "default" : "secondary"}
                      data-testid="badge-terms-status"
                    >
                      {termsStatus?.hasAgreed ? "Agreed" : "Not Agreed"}
                    </Badge>
                    {termsStatus?.hasAgreed && termsStatus?.agreedAt && (
                      <span className="text-xs text-muted-foreground">
                        Agreed on {new Date(termsStatus.agreedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTermsDialog(true)}
                  data-testid="button-view-terms"
                  className={!termsStatus?.hasAgreed ? "border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-400 dark:text-red-400 dark:hover:bg-red-900/20" : ""}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {!termsStatus?.hasAgreed ? "Must Read Terms" : "View Terms"}
                </Button>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  Review the terms and conditions that govern your use of CreteXchange.
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

      {/* Driver Terms Dialog */}
      <DriverTermsDialog
        open={showTermsDialog}
        onOpenChange={setShowTermsDialog}
        readOnly={termsStatus?.hasAgreed || false}
        onAccepted={() => {
          // Refresh terms status when accepted from profile
          window.location.reload();
        }}
      />

      {/* Stripe Connect Onboarding Dialog */}
      <MobileNav role="driver" />
      
      {/* Show Install Prompt after profile completion */}
      {showInstallPrompt && (
        <InstallPrompt
          userType="driver"
          onInstall={() => {
            console.log('✅ User accepted install prompt from profile');
            setShowInstallPrompt(false);
          }}
          onDismiss={() => {
            console.log('❌ User dismissed install prompt from profile');
            setShowInstallPrompt(false);
          }}
        />
      )}
    </div>
  );
}
