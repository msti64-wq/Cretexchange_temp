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
import { User, Truck, CreditCard, Save, FileText, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { InstallPrompt } from "@/components/InstallPrompt";

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
      
      // Check if this is first-time profile completion and show install prompt
      // Must match dashboard completion logic: basic info + driver-specific info + terms
      const isFirstTimeCompletion = formData.phone && formData.address && 
        formData.paymentMethod && formData.paymentMethod !== 'check' &&
        formData.employerName && formData.truckNumber &&
        termsStatus?.hasAgreed;
      
      if (isFirstTimeCompletion) {
        console.log('🎯 Profile completed for first time! Showing install prompt');
        setShowInstallPrompt(true);
      }
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
    address: "",
    paymentMethod: "check",
    paymentFrequency: "weekly",
    employerName: "",
    employerAddress: "",
    employerPhone: "",
    truckNumber: "",
    venmoUsername: "",
    zelleInfo: "",
    bankName: "",
    routingNumber: "",
    accountNumber: "",
    accountType: "checking",
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
        address: userData.address || "",
        paymentMethod: userData.paymentMethod || "check",
        paymentFrequency: userData.paymentFrequency || "weekly",
        employerName: userData.roleData.employerName || "",
        employerAddress: userData.roleData.employerAddress || "",
        employerPhone: userData.roleData.employerPhone || "",
        truckNumber: userData.roleData.truckNumber || "",
        venmoUsername: "",
        zelleInfo: "",
        bankName: "",
        routingNumber: "",
        accountNumber: "",
        accountType: "checking",
      });
    }
  }, [user]);

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
            <div className="flex justify-center gap-2 mt-4">
              <Button 
                variant={isEditing ? "default" : "outline"}
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                data-testid="button-edit-profile"
              >
                {isEditing ? "Cancel" : "Edit Profile"}
              </Button>
            </div>
          </CardContent>
        </Card>

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
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  disabled={!isEditing}
                  data-testid="textarea-address"
                />
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
                <Label htmlFor="employerAddress">Employer Address</Label>
                <Textarea
                  id="employerAddress"
                  value={formData.employerAddress}
                  onChange={(e) => setFormData({...formData, employerAddress: e.target.value})}
                  disabled={!isEditing}
                  data-testid="textarea-employer-address"
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
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <Select 
                  value={formData.paymentMethod}
                  onValueChange={(value) => setFormData({...formData, paymentMethod: value})}
                  disabled={!isEditing}
                >
                  <SelectTrigger data-testid="select-payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venmo">Venmo</SelectItem>
                    <SelectItem value="zelle">Zelle</SelectItem>
                    <SelectItem value="ach">Direct Deposit (ACH)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Payment Account Details */}
              {formData.paymentMethod === 'venmo' && (
                <div>
                  <Label htmlFor="venmoUsername">Venmo Username</Label>
                  <Input
                    id="venmoUsername"
                    placeholder="@username"
                    value={formData.venmoUsername || ''}
                    onChange={(e) => setFormData({...formData, venmoUsername: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-venmo-username"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter your Venmo username (include the @ symbol)
                  </p>
                </div>
              )}

              {formData.paymentMethod === 'zelle' && (
                <div>
                  <Label htmlFor="zelleInfo">Zelle Email or Phone</Label>
                  <Input
                    id="zelleInfo"
                    placeholder="email@example.com or (555) 123-4567"
                    value={formData.zelleInfo || ''}
                    onChange={(e) => setFormData({...formData, zelleInfo: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-zelle-info"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter the email address or phone number linked to your Zelle account
                  </p>
                </div>
              )}

              {formData.paymentMethod === 'ach' && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="bankName">Bank Name</Label>
                    <Input
                      id="bankName"
                      placeholder="e.g., Chase Bank, Wells Fargo"
                      value={formData.bankName || ''}
                      onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                      disabled={!isEditing}
                      data-testid="input-bank-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="routingNumber">Routing Number</Label>
                    <Input
                      id="routingNumber"
                      placeholder="9-digit routing number"
                      value={formData.routingNumber || ''}
                      onChange={(e) => setFormData({...formData, routingNumber: e.target.value})}
                      disabled={!isEditing}
                      data-testid="input-routing-number"
                    />
                  </div>
                  <div>
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input
                      id="accountNumber"
                      placeholder="Your account number"
                      value={formData.accountNumber || ''}
                      onChange={(e) => setFormData({...formData, accountNumber: e.target.value})}
                      disabled={!isEditing}
                      data-testid="input-account-number"
                    />
                  </div>
                  <div>
                    <Label htmlFor="accountType">Account Type</Label>
                    <Select 
                      value={formData.accountType || 'checking'}
                      onValueChange={(value) => setFormData({...formData, accountType: value})}
                      disabled={!isEditing}
                    >
                      <SelectTrigger data-testid="select-account-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Checking</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <Label className="text-blue-800 font-medium">Payment Schedule</Label>
                </div>
                <p className="text-sm text-blue-700">
                  Payments are processed weekly on Fridays for all completed washout activities from the previous week.
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
                  Review the terms and conditions that govern your use of WashOut Pro, 
                  including payment processing fees and service policies.
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
