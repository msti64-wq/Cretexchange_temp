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
import { Building2, CreditCard, Save, AlertCircle, Crown, Lock, Eye, EyeOff, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiRequestError, apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import StripeVerificationStatus from "@/components/StripeVerificationStatus";
import { LogoutButton } from "@/components/LogoutButton";
import { useLanguage } from "@/lib/i18n";
import { resolveFacilityReadinessChecklist, type FacilityReadinessStepId } from "@/lib/pilotOnboarding";
import { resolveOwnerLocationAccessState } from "@shared/ownerLocationAccess";
import { OwnerTermsDialog } from "@/components/OwnerTermsDialog";
import { resolveOwnerTermsReadiness, type OwnerTermsStatus } from "@/lib/ownerTermsReadiness";

export default function OwnerProfile() {
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showOwnerTerms, setShowOwnerTerms] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const { data: user, isLoading, refetch } = useQuery<any>({
    queryKey: ['/api/auth/user'],
  });
  const owner = user?.roleData;
  const locationAccessState = resolveOwnerLocationAccessState(owner, user);
  const { data: facilityLocations = [] } = useQuery<any[]>({
    queryKey: ['/api/owners/locations'],
    enabled: locationAccessState.canManageLocations,
  });
  const ownerTermsStatusUrl = `/api/owners/terms-status?language=${encodeURIComponent(language)}`;
  const {
    data: ownerTermsStatus,
    isLoading: ownerTermsStatusLoading,
    isError: ownerTermsStatusError,
    error: ownerTermsStatusQueryError,
    refetch: refetchOwnerTermsStatus,
  } = useQuery<OwnerTermsStatus>({
    queryKey: [ownerTermsStatusUrl],
    enabled: Boolean(user?.id),
    retry: false,
  });
  const ownerTermsErrorCode = ownerTermsStatusQueryError instanceof ApiRequestError
    ? ownerTermsStatusQueryError.details.code
    : undefined;
  const ownerTermsReadiness = resolveOwnerTermsReadiness({
    status: ownerTermsStatus,
    isLoading: ownerTermsStatusLoading,
    isError: ownerTermsStatusError,
    errorCode: ownerTermsErrorCode,
  });

  // Fetch Stripe requirements
  const { data: stripeRequirements, refetch: refetchStripeRequirements } = useQuery<any>({
    queryKey: ['/api/owners/stripe-requirements'],
    enabled: !!user,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PUT", "/api/owners/profile", data);
    },
    onSuccess: () => {
      toast({
        title: t("owner.profile.updated"),
        description: t("owner.profile.updatedDescription"),
      });
      setIsEditing(false);
      refetch();
      // Also invalidate auth/owner data so profile completion and location gates update
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      void queryClient.refetchQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/locations'] });
      void queryClient.refetchQueries({ queryKey: ['/api/owners/locations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/owners/dashboard'] });
    },
    onError: (error) => {
      toast({
        title: t("owner.profile.updateFailed"),
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
        title: t("owner.profile.passwordChanged"),
        description: t("owner.profile.passwordChangedDescription"),
      });
      setShowChangePassword(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (error: any) => {
      toast({
        title: t("owner.profile.passwordChangeFailed"),
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

  const facilityReadiness = resolveFacilityReadinessChecklist({
    owner,
    user,
    locations: facilityLocations,
  });
  const readinessStepLabels: Record<FacilityReadinessStepId, string> = {
    profile: t("pilot.facility.checklistProfile"),
    approval: t("pilot.facility.checklistApproval"),
    location: t("pilot.facility.checklistLocation"),
    driver_availability: t("pilot.facility.checklistDriverAvailability"),
    operating_hours: t("pilot.facility.checklistOperatingHours"),
  };
  const nextStepIsLocationAction = facilityReadiness.nextStep === "location"
    || facilityReadiness.nextStep === "driver_availability"
    || facilityReadiness.nextStep === "operating_hours";

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
              <p className="text-white/80 text-sm">{t("owner.profile.facilityOperator")}</p>
            </div>
          </div>
          <LogoutButton
            onClick={handleLogout}
            dataTestId="button-logout"
            tone="glass"
            label={t("common.logout")}
            iconOnlyOnMobile={true}
          />
        </div>
      </header>
      
      <div className="p-4 space-y-4">
        {/* Operational readiness intentionally excludes payment and payout status. */}
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
              {t("pilot.facility.readinessTitle")}
            </h2>
            <Badge 
              variant={facilityReadiness.marketplaceReady ? "default" : "secondary"}
              className="mb-4"
              data-testid="badge-approval-status"
            >
              {facilityReadiness.marketplaceReady ? t("pilot.facility.marketplaceReady") : t("pilot.facility.marketplaceActionNeeded")}
            </Badge>
            
            {!owner?.isApproved && (
              <div className="space-y-2 text-sm text-muted-foreground" data-testid="text-facility-approval-pending">
                <p className="font-medium text-foreground">{t("pilot.facility.registrationComplete")}</p>
                <p>{t("pilot.facility.platformOperations")}</p>
                <p>{t("pilot.facility.prepareWhileWaiting")}</p>
                <p>{t("pilot.facility.afterApproval")}</p>
                <p>{t("pilot.facility.delayedSupport")}</p>
              </div>
            )}

            {!facilityReadiness.marketplaceReady && facilityReadiness.nextStep && (
              <div className="mt-4 space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-left" data-testid="facility-readiness-next-step">
                <p className="font-medium text-foreground">{t("pilot.facility.nextStep")}</p>
                <p className="text-sm text-muted-foreground">
                  {t(`pilot.facility.nextStep.${facilityReadiness.nextStep}`)}
                </p>
                {facilityReadiness.nextStep === "profile" ? (
                  <Button onClick={() => setIsEditing(true)} data-testid="button-complete-facility-profile">
                    {t("pilot.facility.completeProfile")}
                  </Button>
                ) : nextStepIsLocationAction ? (
                  <Button onClick={() => setLocation('/locations')} data-testid="button-configure-facility-location">
                    {facilityReadiness.nextStep === "location" ? t("pilot.facility.createFirstLocation") : t("pilot.facility.configureLocation")}
                  </Button>
                ) : null}
              </div>
            )}
            <ul className="mt-5 space-y-2 text-left text-sm" data-testid="list-facility-operational-readiness">
              {facilityReadiness.steps.map((step) => (
                <li key={step.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <span>{readinessStepLabels[step.id]}</span>
                  <Badge variant={step.complete ? "default" : "secondary"}>{step.complete ? t("pilot.facility.complete") : t("pilot.facility.notComplete")}</Badge>
                </li>
              ))}
            </ul>
            {facilityReadiness.marketplaceReady && (
              <p className="mt-4 text-sm font-medium text-green-700" data-testid="text-facility-marketplace-ready">
                {t("pilot.facility.readyForDrivers")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-owner-terms-readiness">
          <CardHeader>
            <CardTitle>{t("owner.terms.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ownerTermsReadiness === "loading" && (
              <p role="status" className="text-sm text-muted-foreground" data-testid="text-owner-terms-loading">
                {t("owner.terms.loading")}
              </p>
            )}
            {ownerTermsReadiness === "accepted" && (
              <>
                <p className="text-sm text-muted-foreground" data-testid="text-owner-terms-accepted">
                  {t("owner.terms.accepted")}
                </p>
                <Button type="button" variant="outline" onClick={() => setShowOwnerTerms(true)} data-testid="button-review-owner-terms">
                  {t("owner.terms.review")}
                </Button>
              </>
            )}
            {ownerTermsReadiness === "required" && (
              <>
                <p className="text-sm text-muted-foreground" data-testid="text-owner-terms-required">
                  {t("owner.terms.required")}
                </p>
                <Button type="button" onClick={() => setShowOwnerTerms(true)} data-testid="button-accept-owner-terms">
                  {t("owner.terms.reviewAndAccept")}
                </Button>
              </>
            )}
            {ownerTermsReadiness === "unavailable" && (
              <>
                <p role="alert" className="text-sm text-destructive" data-testid="text-owner-terms-unavailable">
                  {t("owner.terms.unavailableDescription")}
                </p>
                <Button type="button" variant="outline" onClick={() => void refetchOwnerTermsStatus()} data-testid="button-retry-owner-terms">
                  {t("common.retry")}
                </Button>
              </>
            )}
            {ownerTermsReadiness === "error" && (
              <>
                <p role="alert" className="text-sm text-destructive" data-testid="text-owner-terms-error">
                  {t("owner.terms.errorDescription")}
                </p>
                <Button type="button" variant="outline" onClick={() => void refetchOwnerTermsStatus()} data-testid="button-retry-owner-terms">
                  {t("common.retry")}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("pilot.facility.separateAccountSetup")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("pilot.facility.separateAccountSetupHelp")}</p>
          </CardContent>
        </Card>

        {/* Financial account setup remains separate from operational readiness. */}
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
                    {isEditing ? t("common.cancel") : t("common.edit")}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">{t("owner.profile.firstName")}</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-first-name"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">{t("owner.profile.lastName")}</Label>
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
                  <Label htmlFor="email">{t("common.email")}</Label>
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
                  <Label htmlFor="phone">{t("owner.profile.phoneNumber")}</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-phone"
                />
              </div>
              
              <div>
                <Label htmlFor="street">{t("owner.profile.streetAddress")}</Label>
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
                  <Label htmlFor="city">{t("common.city")}</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({...formData, city: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-city"
                  />
                </div>

                <div>
                  <Label htmlFor="state">{t("common.state")}</Label>
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
                <Label htmlFor="zip">{t("common.zipCode")}</Label>
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
                <Label htmlFor="dateOfBirth">{t("owner.profile.dateOfBirth")}</Label>
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
                <Label htmlFor="ssnLast4">{t("owner.profile.ssnLast4")}</Label>
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
                <Label htmlFor="businessWebsite">{t("owner.profile.businessWebsite")}</Label>
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
                      <DialogTitle>{t("owner.profile.changePassword")}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                      <div>
                        <Label htmlFor="currentPassword">{t("owner.profile.currentPassword")}</Label>
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
                        <Label htmlFor="newPassword">{t("owner.profile.newPassword")}</Label>
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
                        <Label htmlFor="confirmPassword">{t("owner.profile.confirmPassword")}</Label>
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
                          {changePasswordMutation.isPending ? t("owner.profile.changing") : t("owner.profile.changePassword")}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                <p>{t("owner.profile.passwordHelp")}</p>
                <p className="mt-1">{t("owner.profile.lastUpdatedNever")}</p>
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
                <Label htmlFor="companyName">{t("owner.profile.companyName")}</Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-company-name"
                />
              </div>
              
              <div>
                <Label htmlFor="businessLicense">{t("owner.profile.businessLicense")}</Label>
                <Input
                  id="businessLicense"
                  value={formData.businessLicense}
                  onChange={(e) => setFormData({...formData, businessLicense: e.target.value})}
                  disabled={!isEditing}
                  data-testid="input-business-license"
                />
              </div>
              
              <div>
                <Label htmlFor="taxId">{t("owner.profile.taxId")}</Label>
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
                <Label htmlFor="paymentMethod">{t("owner.profile.paymentMethod")}</Label>
                <Select 
                  value={formData.paymentMethod}
                  onValueChange={(value) => setFormData({...formData, paymentMethod: value})}
                  disabled={!isEditing}
                >
                  <SelectTrigger data-testid="select-payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ach">{t("owner.profile.ach")}</SelectItem>
                    <SelectItem value="credit_card">{t("owner.profile.creditCard")}</SelectItem>
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
              {updateProfileMutation.isPending ? t("common.saving") : t("owner.profile.saveChanges")}
            </Button>
          )}
        </form>
      </div>

      <OwnerTermsDialog
        open={showOwnerTerms}
        onOpenChange={setShowOwnerTerms}
        readOnly={ownerTermsReadiness === "accepted"}
        onAccepted={() => void refetchOwnerTermsStatus()}
      />

      <MobileNav role="owner" />
    </div>
  );
}
