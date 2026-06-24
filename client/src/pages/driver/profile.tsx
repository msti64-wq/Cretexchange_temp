import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { DriverTermsDialog } from "@/components/DriverTermsDialog";
import { DriverPayoutSettings } from "@/components/DriverPayoutSettings";
import { User, Truck, Save, FileText, Eye, Smartphone, Gift } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { InstallPrompt } from "@/components/InstallPrompt";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { FEATURE_FLAGS } from "@shared/featureFlags";
import { hasHandledInstallPromptThisSession, markInstallPromptHandledThisSession } from "@/hooks/usePWAInstall";
import { useLanguage } from "@/lib/i18n";
import { DSCard, DSStatusChip } from "@/components/design-system";

export default function DriverProfile() {
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const contrastFieldClassName = "!opacity-100 text-foreground disabled:!opacity-100 disabled:text-foreground";

  const { data: user, isLoading, refetch } = useQuery<any>({
    queryKey: ['/api/auth/user'],
  });

  // Fetch driver terms status
  const { data: termsStatus } = useQuery<{hasAgreed: boolean; agreedAt: string | null}>({
    queryKey: [`/api/drivers/terms-status?language=${encodeURIComponent(language)}`],
  });

  const {
    enabled: driverStripePayoutsEnabled,
    isLoading: driverStripePayoutsLoading,
  } = useFeatureFlag(FEATURE_FLAGS.DRIVER_STRIPE_PAYOUTS);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PUT", "/api/drivers/profile", data);
    },
    onSuccess: () => {
      toast({
        title: t("driver.profile.profileUpdated"),
        description: t("driver.profile.profileUpdatedDescription"),
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: [`/api/drivers/terms-status?language=${encodeURIComponent(language)}`] });
      refetch();
    },
    onError: (error) => {
      toast({
        title: t("driver.profile.updateFailed"),
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
    payoutPreference: "bank_transfer",
    payoutPreferenceNote: "",
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
        payoutPreference: userData.roleData.payoutPreference || "bank_transfer",
        payoutPreferenceNote: userData.roleData.payoutPreferenceNote || "",
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
      
      if (isProfileComplete && hasEssentialInfo && !showInstallPrompt && !hasHandledInstallPromptThisSession()) {
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
        <DSCard padding="lg">
          <CardContent className="p-6 text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-1" data-testid="text-user-name">
              {(user as any)?.firstName} {(user as any)?.lastName}
            </h2>
            <p className="text-muted-foreground" data-testid="text-user-role">{t("driver.profile.concreteTruckDriver")}</p>
            <div className="flex justify-center gap-2 mt-4 flex-wrap">
              <Button 
                variant={isEditing ? "default" : "outline"}
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                className="border-slate-700 bg-slate-800/90 text-white hover:bg-slate-700 hover:text-white"
                data-testid="button-edit-profile"
              >
                {isEditing ? t("driver.profile.cancel") : t("driver.profile.editProfile")}
              </Button>
            </div>
          </CardContent>
        </DSCard>

        <DriverPayoutSettings
          featureEnabled={driverStripePayoutsEnabled}
          featureLoading={driverStripePayoutsLoading}
          onStatusRefresh={() => refetch()}
        />

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Personal Information */}
          <DSCard padding="lg">
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="w-5 h-5 mr-2" />
                {t("driver.profile.personalInformation")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">{t("driver.profile.firstName")}</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                    disabled={!isEditing}
                    className={contrastFieldClassName}
                    data-testid="input-first-name"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">{t("driver.profile.lastName")}</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                    disabled={!isEditing}
                    className={contrastFieldClassName}
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
                  className={contrastFieldClassName}
                  data-testid="input-email"
                />
              </div>
              
              <div>
                <Label htmlFor="phone">{t("driver.profile.phoneNumber")}</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  disabled={!isEditing}
                  className={contrastFieldClassName}
                  data-testid="input-phone"
                />
              </div>
              
              <div>
                <Label htmlFor="street">{t("driver.profile.streetAddress")}</Label>
                <Input
                  id="street"
                  value={formData.street}
                  onChange={(e) => setFormData({...formData, street: e.target.value})}
                  disabled={!isEditing}
                  className={contrastFieldClassName}
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
                    className={contrastFieldClassName}
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
                    className={contrastFieldClassName}
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
                  className={contrastFieldClassName}
                  data-testid="input-zip"
                />
              </div>

            </CardContent>
          </DSCard>

          {/* Employment Information */}
          <DSCard padding="lg">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Truck className="w-5 h-5 mr-2" />
                {t("driver.profile.employmentInformation")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="employerName">{t("driver.profile.employerName")}</Label>
                <Input
                  id="employerName"
                  value={formData.employerName}
                  onChange={(e) => setFormData({...formData, employerName: e.target.value})}
                  disabled={!isEditing}
                  className={contrastFieldClassName}
                  data-testid="input-employer-name"
                />
              </div>
              
              <div>
                <Label htmlFor="employerStreet">{t("driver.profile.employerStreetAddress")}</Label>
                <Input
                  id="employerStreet"
                  value={formData.employerStreet}
                  onChange={(e) => setFormData({...formData, employerStreet: e.target.value})}
                  disabled={!isEditing}
                  className={contrastFieldClassName}
                  data-testid="input-employer-street"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="employerCity">{t("driver.profile.employerCity")}</Label>
                  <Input
                    id="employerCity"
                    value={formData.employerCity}
                    onChange={(e) => setFormData({...formData, employerCity: e.target.value})}
                    disabled={!isEditing}
                    className={contrastFieldClassName}
                    data-testid="input-employer-city"
                  />
                </div>

                <div>
                    <Label htmlFor="employerState">{t("driver.profile.employerState")}</Label>
                  <Input
                    id="employerState"
                    value={formData.employerState}
                    onChange={(e) => setFormData({...formData, employerState: e.target.value})}
                    disabled={!isEditing}
                    maxLength={2}
                    className={contrastFieldClassName}
                    data-testid="input-employer-state"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="employerZip">{t("driver.profile.employerZipCode")}</Label>
                <Input
                  id="employerZip"
                  value={formData.employerZip}
                  onChange={(e) => setFormData({...formData, employerZip: e.target.value})}
                  disabled={!isEditing}
                  className={contrastFieldClassName}
                  data-testid="input-employer-zip"
                />
              </div>
              
              <div>
                <Label htmlFor="employerPhone">{t("driver.profile.employerPhone")}</Label>
                <Input
                  id="employerPhone"
                  value={formData.employerPhone}
                  onChange={(e) => setFormData({...formData, employerPhone: e.target.value})}
                  disabled={!isEditing}
                  className={contrastFieldClassName}
                  data-testid="input-employer-phone"
                />
              </div>
              
              <div>
                <Label htmlFor="truckNumber">{t("driver.profile.truckNumber")}</Label>
                <Input
                  id="truckNumber"
                  placeholder="e.g., Truck #123, Unit A5"
                  value={formData.truckNumber}
                  onChange={(e) => setFormData({...formData, truckNumber: e.target.value})}
                  disabled={!isEditing}
                  className={contrastFieldClassName}
                  data-testid="input-truck-number"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("driver.profile.truckNumberHelp")}
                </p>
              </div>
            </CardContent>
          </DSCard>

          {/* Lottery Prize Preference */}
          <DSCard padding="lg">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Gift className="w-5 h-5 mr-2" />
                {t("driver.profile.lotteryPrizePreference")}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                {t("driver.profile.lotteryPrizePreferenceDescription")}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("driver.profile.prizeDeliveryMethod")}</Label>
                <Select
                  value={formData.payoutPreference}
                  onValueChange={(val) => setFormData({ ...formData, payoutPreference: val, payoutPreferenceNote: val !== "other_prize" ? "" : formData.payoutPreferenceNote })}
                  disabled={!isEditing}
                >
                  <SelectTrigger className={contrastFieldClassName} data-testid="select-payout-preference">
                    <SelectValue placeholder={t("driver.profile.selectPreference")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gift_card">
                      {t("driver.profile.prepaidDebitCard")}
                    </SelectItem>
                    <SelectItem value="other_prize">
                      {t("driver.profile.surpriseMe")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.payoutPreference === "other_prize" && (
                <div className="space-y-2">
                  <Label htmlFor="payoutPreferenceNote">{t("driver.profile.tellUsMore")}</Label>
                <Input
                  id="payoutPreferenceNote"
                  placeholder="e.g., merchandise, restaurant gift card, tool store credit..."
                  value={formData.payoutPreferenceNote}
                  onChange={(e) => setFormData({ ...formData, payoutPreferenceNote: e.target.value })}
                  disabled={!isEditing}
                  className={contrastFieldClassName}
                  data-testid="input-payout-preference-note"
                />
                </div>
              )}

              {!isEditing && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Gift className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    {t("driver.profile.currentPreference")} <span className="font-medium text-foreground">
                      {formData.payoutPreference === "bank_transfer" ? t("driver.profile.directDepositUnavailable") :
                       formData.payoutPreference === "gift_card" ? t("driver.profile.prepaidDebitCard") :
                       formData.payoutPreference === "other_prize" ? t("driver.profile.otherPrize") :
                       t("common.notSet")}
                    </span>
                    {formData.payoutPreferenceNote && ` — ${formData.payoutPreferenceNote}`}
                  </p>
                </div>
              )}
            </CardContent>
          </DSCard>

          {/* App Settings Section */}
          <DSCard padding="lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                {t("driver.profile.appInstallation")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("driver.profile.installCreteXchange")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("driver.profile.installHelp")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (hasHandledInstallPromptThisSession()) {
                      return;
                    }
                    setShowInstallPrompt(true);
                  }}
                  className="w-full border-slate-700 bg-slate-800/90 text-white hover:bg-slate-700 hover:text-white sm:w-auto"
                  data-testid="button-install-app-manual"
                >
                  <Smartphone className="w-4 h-4 mr-2" />
                  {t("driver.profile.installApp")}
                </Button>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {t("driver.profile.installBenefit")}
                </p>
              </div>
            </CardContent>
          </DSCard>

          {/* Terms & Conditions Section */}
          <DSCard padding="lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {t("driver.profile.terms")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("driver.profile.driverTermsAgreement")}</p>
                  <div className="flex items-center gap-2">
                    <DSStatusChip tone={termsStatus?.hasAgreed ? "success" : "warning"} data-testid="badge-terms-status">
                      {termsStatus?.hasAgreed ? t("driver.profile.agreed") : t("driver.profile.notAgreed")}
                    </DSStatusChip>
                    {termsStatus?.hasAgreed && termsStatus?.agreedAt && (
                      <span className="text-xs text-muted-foreground">
                        {t("driver.profile.agreedOn", { date: new Date(termsStatus.agreedAt).toLocaleDateString() })}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTermsDialog(true)}
                  className="w-full border-orange-700 bg-orange-600 text-white hover:bg-orange-700 hover:text-white sm:w-auto"
                  data-testid="button-view-terms"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {!termsStatus?.hasAgreed ? t("driver.profile.mustReadTerms") : t("driver.profile.viewTerms")}
                </Button>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">
                  {t("driver.profile.termsHelp")}
                </p>
              </div>
            </CardContent>
          </DSCard>

          {isEditing && (
            <Button 
              type="submit" 
              className="w-full"
              disabled={updateProfileMutation.isPending}
              data-testid="button-save-profile"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateProfileMutation.isPending ? t("common.saving") : t("driver.profile.saveChanges")}
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
          queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
          queryClient.invalidateQueries({ queryKey: [`/api/drivers/terms-status?language=${encodeURIComponent(language)}`] });
          refetch();
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
            markInstallPromptHandledThisSession();
            setShowInstallPrompt(false);
          }}
          onDismiss={() => {
            console.log('❌ User dismissed install prompt from profile');
            markInstallPromptHandledThisSession();
            setShowInstallPrompt(false);
          }}
        />
      )}
    </div>
  );
}
