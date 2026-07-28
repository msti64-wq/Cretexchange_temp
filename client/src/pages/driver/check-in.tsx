import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { DriverHeader } from "@/components/DriverHeader";
import { WashoutForm } from "@/components/WashoutForm";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, AlertCircle } from "lucide-react";
import { createSubmissionConfirmationRecord } from "@/lib/pilotOnboarding";
import { apiRequest } from "@/lib/queryClient";
import { driverMaterialIntentKey, type DriverMaterialIntent } from "@/components/driver/DriverMaterialIntentSelector";
import { resolveDriverCheckInRecoveryState } from "@/lib/driverCheckInRecovery";
import { useLanguage } from "@/lib/i18n";

const SUBMISSION_CONFIRMATION_SESSION_KEY = "cretexchange.driver.submission-confirmation";

export default function DriverCheckIn() {
  const { locationId } = useParams();
  const [, setLocation] = useLocation();
  const { t } = useLanguage();

  const { data: materialIntent, isLoading: materialIntentLoading } = useQuery<DriverMaterialIntent>({
    queryKey: driverMaterialIntentKey,
    queryFn: async () => (await apiRequest("GET", "/api/drivers/material-intent")).json(),
  });
  const activeMaterialSlug = materialIntent?.materialSlug || null;
  const { data: location, isLoading, isError, refetch } = useQuery({
    queryKey: ['/api/drivers/locations', activeMaterialSlug],
    queryFn: async () => activeMaterialSlug ? (await apiRequest("GET", `/api/drivers/locations?materialSlug=${encodeURIComponent(activeMaterialSlug)}`)).json() : [],
    select: (data: any[]) => {
      const item = data.find((item: any) => {
        const loc = item.washout_locations || item;
        return loc.id === locationId;
      });
      return item ? (item.washout_locations || item) : null;
    },
    enabled: !!locationId && !materialIntentLoading,
  });
  const recoveryState = resolveDriverCheckInRecoveryState({
    materialIntentLoading,
    activeMaterialSlug,
    locationLoading: isLoading,
    locationError: isError,
    hasLocation: Boolean(location),
  });

  const handleSuccess = (activityId?: string) => {
    const record = createSubmissionConfirmationRecord(activityId);
    if (!record) {
      setLocation('/activity');
      return;
    }

    try {
      window.sessionStorage.setItem(SUBMISSION_CONFIRMATION_SESSION_KEY, JSON.stringify(record));
    } catch {
      // A confirmed submission remains available in Activity even when browser
      // session storage is unavailable; the confirmation panel stays hidden.
    }

    setLocation(`/activity?submittedActivityId=${encodeURIComponent(record.activityId)}`);
  };

  if (recoveryState === "loading") {
    return (
      <div className="min-h-screen bg-background">
        <DriverHeader />
        <div className="p-4">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded mb-4" />
            <div className="h-64 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (recoveryState === "missing_material") {
    return (
      <div className="min-h-screen bg-background">
        <DriverHeader />
        <div className="p-4"><Card><CardContent className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">{t("driver.checkIn.selectMaterialTitle")}</h2>
          <p className="text-muted-foreground mb-4">{t("driver.checkIn.selectMaterialDescription")}</p>
          <Button onClick={() => setLocation('/locations')} data-testid="button-select-material">
            <MapPin className="w-4 h-4 mr-2" />{t("driver.checkIn.selectMaterialAction")}
          </Button>
        </CardContent></Card></div>
      </div>
    );
  }

  if (recoveryState === "location_unavailable") {
    return (
      <div className="min-h-screen bg-background">
        <DriverHeader />
        <div className="p-4"><Card><CardContent className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">{t("driver.checkIn.locationUnavailableTitle")}</h2>
          <p className="text-muted-foreground mb-4">{t("driver.checkIn.locationUnavailableDescription")}</p>
          <Button onClick={() => void refetch()} data-testid="button-retry-location">{t("common.retry")}</Button>
        </CardContent></Card></div>
      </div>
    );
  }

  if (recoveryState === "location_missing_or_ineligible") {
    return (
      <div className="min-h-screen bg-background">
        <DriverHeader />
        <div className="p-4">
          <Card>
            <CardContent className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">{t("driver.checkIn.locationNotFoundTitle")}</h2>
              <p className="text-muted-foreground mb-4">{t("driver.checkIn.locationNotFoundDescription")}</p>
              <Button onClick={() => setLocation('/locations')} data-testid="button-back-to-locations">
                <MapPin className="w-4 h-4 mr-2" />
                {t("driver.checkIn.browseLocations")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DriverHeader />
      
      <div className="p-4">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => setLocation('/locations')}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("driver.checkIn.backToLocations")}
        </Button>

        {/* Check-in Form */}
        <WashoutForm
          location={location}
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  );
}
