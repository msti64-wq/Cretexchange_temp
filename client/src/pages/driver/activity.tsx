import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DriverHeader } from "@/components/DriverHeader";
import { MobileNav } from "@/components/MobileNav";
import { PhotoModal } from "@/components/PhotoModal";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Download, MapPin, Clock, Image as ImageIcon, Filter } from "lucide-react";
import { Calendar as DateCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";
import { DSCard, DSKpiCard, DSSectionHeader, DSStatusChip } from "@/components/design-system";
import { resolveSubmittedActivityConfirmation, type SubmissionConfirmationRecord } from "@/lib/pilotOnboarding";
import { apiRequest } from "@/lib/queryClient";
import {
  calculateVerifiedOperationalActivityValue,
  matchesDriverActivityOperationalFilter,
  resolvePendingReviewSupportGuidance,
  resolveWashoutOperationalStatus,
  type DriverActivityOperationalFilter,
} from "@/lib/washoutOperationalStatus";

const SUBMISSION_CONFIRMATION_SESSION_KEY = "cretexchange.driver.submission-confirmation";

function AdministrativeReviewPanel({ activity, index }: { activity: any; index: number }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const record = activity.washout_activities || activity;
  const activityId = record.id;
  const eligible = record.status === "rejected" && Boolean(record.rejectedAt && record.rejectionReason);
  const reviewUrl = `/api/drivers/activities/${activityId}/administrative-review`;
  const { data: review } = useQuery<any>({ queryKey: [reviewUrl], enabled: eligible, retry: false });
  const request = useMutation({
    mutationFn: () => apiRequest("POST", reviewUrl, { explanation: explanation.trim(), confirmationAcknowledged: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [reviewUrl] }); setOpen(false); setExplanation(""); setConfirmed(false); },
  });

  if (!eligible) return null;
  if (review) {
    const statusKey = review.resolution === "closed" ? "adminReview.closed" : review.resolution === "returned_to_owner_review" ? "adminReview.returned" : "adminReview.requested";
    return <div className="mt-3 rounded-lg border border-sky-300/60 bg-sky-50/70 p-3 text-sm dark:border-sky-900/60 dark:bg-sky-950/25" data-testid={`driver-admin-review-status-${index}`} aria-live="polite">
      <p className="font-semibold text-foreground">{t(statusKey)}</p>
      <p className="mt-1 text-muted-foreground">{new Date(review.requestedAt).toLocaleDateString()}</p>
      <p className="mt-1 text-muted-foreground">{t("adminReview.driverExplanation")}: {review.driverExplanation}</p>
      {review.rationale && <p className="mt-1 text-muted-foreground">{t("adminReview.participantRationale")}: {review.rationale}</p>}
      <p className="mt-2 text-muted-foreground">{t(review.resolution === "closed" ? "adminReview.closedDriverGuidance" : review.resolution === "returned_to_owner_review" ? "adminReview.returnedDriverGuidance" : "adminReview.awaiting")}</p>
    </div>;
  }
  return <>
    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)} data-testid={`button-request-administrative-review-${index}`}>
      {t("adminReview.requestAction")}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("adminReview.requestTitle")}</DialogTitle><DialogDescription>{t("adminReview.requestDescription")}</DialogDescription></DialogHeader>
        <label className="grid gap-2 text-sm font-medium" htmlFor={`admin-review-explanation-${activityId}`}>{t("adminReview.explanationLabel")}
          <Textarea id={`admin-review-explanation-${activityId}`} value={explanation} onChange={(event) => setExplanation(event.target.value)} minLength={10} maxLength={1000} aria-describedby={`admin-review-explanation-help-${activityId}`} />
        </label>
        <p id={`admin-review-explanation-help-${activityId}`} className="text-xs text-muted-foreground">{t("adminReview.explanationHelp")}</p>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{t("adminReview.requestConfirm")}</label>
        {request.error && <p className="text-sm text-destructive" role="alert">{t("adminReview.requestError")}</p>}
        <DialogFooter><Button type="button" onClick={() => request.mutate()} disabled={request.isPending || explanation.trim().length < 10 || !confirmed}>{request.isPending ? t("common.loading") : t("adminReview.submitRequest")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function readSubmissionConfirmationRecord(): SubmissionConfirmationRecord | null {
  try {
    const rawRecord = window.sessionStorage.getItem(SUBMISSION_CONFIRMATION_SESSION_KEY);
    if (!rawRecord) return null;

    const record = JSON.parse(rawRecord) as SubmissionConfirmationRecord;
    return typeof record?.activityId === "string" && Number.isFinite(record?.createdAt) ? record : null;
  } catch {
    return null;
  }
}

function clearSubmissionConfirmationRecord() {
  try {
    window.sessionStorage.removeItem(SUBMISSION_CONFIRMATION_SESSION_KEY);
  } catch {
    // Session storage can be unavailable in privacy-restricted browser contexts.
  }
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function DateFilterButton({
  label,
  value,
  onValueChange,
  testId,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateInputValue(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-10 w-full justify-between border-slate-700 bg-slate-800/90 px-3 text-left text-slate-100 hover:bg-slate-700 hover:text-white"
          data-testid={testId}
        >
          <span className="truncate">{selectedDate ? formatDate(selectedDate) : label}</span>
          <Calendar className="h-4 w-4 shrink-0 text-sky-300" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <DateCalendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) return;
            onValueChange(formatDateInputValue(date));
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export default function DriverActivity() {
  const { t, language } = useLanguage();
  const [currentPath, setLocation] = useLocation();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterStatus, setFilterStatus] = useState<DriverActivityOperationalFilter>("all");
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isSubmissionConfirmationDismissed, setIsSubmissionConfirmationDismissed] = useState(false);
  const submittedActivityId = new URLSearchParams(currentPath.split("?")[1] || "").get("submittedActivityId");

  // Build URLs with query parameters instead of path parameters
  const activitiesUrl = `/api/drivers/activities${startDate || endDate ? '?' : ''}${
    [
      startDate ? `startDate=${startDate}` : '',
      endDate ? `endDate=${endDate}` : ''
    ].filter(Boolean).join('&')
  }`;
  
  const paymentsUrl = `/api/drivers/payments${startDate || endDate ? '?' : ''}${
    [
      startDate ? `startDate=${startDate}` : '',
      endDate ? `endDate=${endDate}` : ''
    ].filter(Boolean).join('&')
  }`;

  const { data: activities, isLoading } = useQuery<any[]>({
    queryKey: [activitiesUrl],
    staleTime: 0, // Always fetch fresh data
  });

  const { data: payments } = useQuery<any[]>({
    queryKey: [paymentsUrl],
    staleTime: 0, // Always fetch fresh data  
  });

  const submittedActivityConfirmation = resolveSubmittedActivityConfirmation({
    referencedActivityId: submittedActivityId,
    record: readSubmissionConfirmationRecord(),
    activities,
  });
  const showSubmissionConfirmation = Boolean(submittedActivityConfirmation) && !isSubmissionConfirmationDismissed;

  const dismissSubmissionConfirmation = () => {
    clearSubmissionConfirmationRecord();
    setIsSubmissionConfirmationDismissed(true);
    setLocation("/activity");
  };

  useEffect(() => {
    const root = document.documentElement;
    const hadDarkClass = root.classList.contains("dark");
    root.classList.add("dark");

    return () => {
      if (!hadDarkClass) {
        root.classList.remove("dark");
      }
    };
  }, []);

  const filteredActivities = activities?.filter((activity: any) => {
    const record = activity.washout_activities || activity;
    return matchesDriverActivityOperationalFilter({
      status: record.status,
      rejectionReason: record.rejectionReason,
    }, filterStatus);
  }) || [];

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const headers: any = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/export/driver-activities?startDate=${startDate}&endDate=${endDate}`, {
        headers,
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `driver-activities-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  const stats = {
    totalActivities: filteredActivities.length,
    verifiedActivityValue: calculateVerifiedOperationalActivityValue(filteredActivities),
    verifiedCount: filteredActivities.filter((activity: any) => {
      const record = activity.washout_activities || activity;
      return resolveWashoutOperationalStatus({ status: record.status, audience: "driver" }).state === "verified";
    }).length,
    pendingCount: filteredActivities.filter((activity: any) => {
      const record = activity.washout_activities || activity;
      return resolveWashoutOperationalStatus({ status: record.status, audience: "driver" }).state === "pending_review";
    }).length,
  };

  if (isLoading) {
    return (
      <div className="dark min-h-screen bg-background text-foreground">
        <DriverHeader />
        <div className="animate-pulse p-4 space-y-4">
          <div className="h-32 rounded-2xl bg-muted/70" />
          <div className="h-10 rounded-2xl bg-muted/70" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-muted/70" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-background pb-20 text-foreground">
      <DriverHeader />
      
      <div className="p-4 space-y-4">
        {showSubmissionConfirmation && (
          <DSCard
            padding="lg"
            className="border-sky-300 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-950/30"
            data-testid="panel-submission-confirmation"
          >
            <DSSectionHeader
              title={t("pilot.submission.title")}
              description={t("pilot.submission.message")}
            />
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <p>{t("pilot.submission.pendingReview")}</p>
              <p>{t("pilot.submission.next")}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={dismissSubmissionConfirmation}
              data-testid="button-dismiss-submission-confirmation"
            >
              {t("pilot.submission.dismiss")}
            </Button>
          </DSCard>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-3">
          <DSKpiCard label={t("driver.activity.totalWashouts")} value={stats.totalActivities} detail={t("driver.activity.totalWashouts")} accentTone="info" data-testid="text-total-activities" />
          <DSKpiCard label={t("driver.activity.verifiedActivityValue")} value={formatCurrency(stats.verifiedActivityValue)} detail={t("driver.activity.verifiedActivityValueDetail")} accentTone="success" data-testid="text-verified-activity-value" />
          <DSKpiCard label={t("driver.activity.verified")} value={stats.verifiedCount} detail={t("driver.activity.verified")} accentTone="success" data-testid="text-verified-count" />
          <DSKpiCard label={t("driver.activity.pending")} value={stats.pendingCount} detail={t("driver.activity.pending")} accentTone="warning" data-testid="text-pending-count" />
        </div>

        {/* Filters */}
        <DSCard padding="md">
          <DSSectionHeader
            eyebrow={<Filter className="inline-block h-4 w-4 align-[-2px]" />}
            title={t("common.filters")}
            description={t("driver.activity.activityHistory")}
            actions={
              <Button
                  variant="default" 
                  size="sm"
                  onClick={handleExport}
                  className="w-full border-border bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground sm:w-auto"
                  data-testid="button-export"
                >
                  <Download className="w-4 h-4 mr-2" />
                {t("common.exportCsv")}
              </Button>
            }
          />
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm text-foreground/75">{t("driver.activity.startDate")}</label>
                <DateFilterButton
                  label={t("driver.activity.startDate")}
                  value={startDate}
                  onValueChange={setStartDate}
                  testId="button-start-date"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-foreground/75">{t("driver.activity.endDate")}</label>
                <DateFilterButton
                  label={t("driver.activity.endDate")}
                  value={endDate}
                  onValueChange={setEndDate}
                  testId="button-end-date"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button 
                  size="sm"
                  variant={filterStatus === "all" ? "default" : "outline"}
                  onClick={() => setFilterStatus("all")}
                  className={
                    filterStatus === "all"
                      ? "border-border bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                      : "border-border bg-card/80 text-foreground hover:bg-card hover:text-foreground"
                  }
                  data-testid="button-filter-all"
                >
                {t("common.all")}
              </Button>
                <Button 
                  size="sm"
                  variant={filterStatus === "verified" ? "default" : "outline"}
                  onClick={() => setFilterStatus("verified")}
                  className={
                    filterStatus === "verified"
                      ? "border-border bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                      : "border-border bg-card/80 text-foreground hover:bg-card hover:text-foreground"
                  }
                  data-testid="button-filter-verified"
                >
                {t("driver.activity.verified")}
              </Button>
                <Button 
                  size="sm"
                  variant={filterStatus === "pending" ? "default" : "outline"}
                  onClick={() => setFilterStatus("pending")}
                  className={
                    filterStatus === "pending"
                      ? "border-border bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                      : "border-border bg-card/80 text-foreground hover:bg-card hover:text-foreground"
                  }
                  data-testid="button-filter-pending"
                >
                {t("driver.activity.pending")}
              </Button>
              <Button
                size="sm"
                variant={filterStatus === "needs_action" ? "default" : "outline"}
                onClick={() => setFilterStatus("needs_action")}
                className={
                  filterStatus === "needs_action"
                    ? "border-border bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                    : "border-border bg-card/80 text-foreground hover:bg-card hover:text-foreground"
                }
                data-testid="button-filter-needs-action"
              >
                {t("driver.activity.needsAction")}
              </Button>
            </div>
          </div>
        </DSCard>

        {/* Activity List */}
        <div className="space-y-3">
          <DSSectionHeader
            eyebrow={<Calendar className="inline-block h-4 w-4 align-[-2px]" />}
            title={t("driver.activity.activityHistory")}
          />

          {filteredActivities.length === 0 ? (
            <DSCard padding="lg">
              <div className="text-center py-8">
                <Clock className="w-12 h-12 text-foreground/65 mx-auto mb-4" />
                <p className="text-foreground/75">{t("driver.activity.noActivities")}</p>
              </div>
            </DSCard>
          ) : (
            filteredActivities.map((activity: any, index: number) => {
              const activityRecord = activity.washout_activities || activity;
              const operationalStatus = resolveWashoutOperationalStatus({
                status: activityRecord.status,
                rejectionReason: activityRecord.rejectionReason,
                audience: "driver",
              });
              const pendingReviewGuidance = resolvePendingReviewSupportGuidance({
                status: activityRecord.status,
                submittedAt: activityRecord.checkInTime ?? activityRecord.createdAt,
              });

              return (
              <DSCard key={activity.washout_activities?.id || activity.id || index} className="hover:shadow-md transition-shadow" padding="md" data-testid={`card-activity-${index}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1" data-testid={`text-activity-location-${index}`}>
                        {activity.washout_locations?.name || activity.location?.name || t("driver.activity.unknownLocation")}
                      </h3>
                      <p className="text-sm text-foreground/75 mb-2" data-testid={`text-activity-address-${index}`}>
                        {activity.washout_locations?.address || activity.location?.address || ''}
                      </p>
                      {(activity.location?.owner?.user || activity.washout_locations?.owner?.user) && (
                        <p className="text-xs text-foreground/65 mb-2" data-testid={`text-owner-name-${index}`}>
                          {t("driver.activity.ownerName", { name: `${activity.location?.owner?.user?.firstName || activity.washout_locations?.owner?.user?.firstName} ${activity.location?.owner?.user?.lastName || activity.washout_locations?.owner?.user?.lastName}` })}
                        </p>
                      )}
                      {(activity.location?.owner?.user?.phone || activity.washout_locations?.owner?.user?.phone) && (
                        <p className="text-xs text-foreground/65 mb-2" data-testid={`text-owner-phone-${index}`}>
                          {t("driver.activity.ownerPhone", { phone: activity.location?.owner?.user?.phone || activity.washout_locations?.owner?.user?.phone })}
                        </p>
                      )}
                      {((activity.washout_activities?.latitude && activity.washout_activities?.longitude) || (activity.latitude && activity.longitude)) && (
                        <p className="text-xs text-foreground/65 mb-2" data-testid={`text-gps-coordinates-${index}`}>
                          {t("driver.activity.gps")} {Number(activity.washout_activities?.latitude || activity.latitude).toFixed(6)}, {Number(activity.washout_activities?.longitude || activity.longitude).toFixed(6)}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-foreground/70">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          <span data-testid={`text-activity-date-${index}`}>
                            {new Date(activity.washout_activities?.checkInTime || activity.checkInTime).toLocaleDateString(language === "es" ? "es-US" : "en-US")} at{' '}
                            {new Date(activity.washout_activities?.checkInTime || activity.checkInTime).toLocaleTimeString(language === "es" ? "es-US" : "en-US", {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-foreground mb-1" data-testid={`text-activity-amount-${index}`}>
                        {formatCurrency(Number(activity.washout_activities?.amount || activity.amount || 0))}
                      </div>
                      <DSStatusChip
                        tone={operationalStatus.tone}
                        data-testid={`badge-activity-status-${index}`}
                      >
                        {t(operationalStatus.labelKey)}
                      </DSStatusChip>
                    </div>
                  </div>

                  <div className="mb-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground" data-testid={`text-activity-recovery-${index}`}>
                    <p>{t(operationalStatus.detailKey)}</p>
                    {operationalStatus.rejectionReason ? (
                      <p className="mt-1 font-medium text-foreground">{t("washout.status.rejectionReason", { reason: operationalStatus.rejectionReason })}</p>
                    ) : (
                      <p className="mt-1">{t(operationalStatus.nextActionKey)}</p>
                    )}
                    {pendingReviewGuidance.isOverdue && (
                      <p className="mt-1 font-medium text-foreground" data-testid={`text-pending-review-support-${index}`}>
                        {t("washout.recovery.pending_review.driverOverdue")}
                      </p>
                    )}
                  </div>

                  <AdministrativeReviewPanel activity={activity} index={index} />

                  {(activity.washout_activities?.notes || activity.notes) && (
                    <p className="text-sm text-foreground/75 mb-3" data-testid={`text-activity-notes-${index}`}>
                      {activity.washout_activities?.notes || activity.notes}
                    </p>
                  )}

                  {(activity.washout_activities?.photoUrls || activity.photoUrls) && (activity.washout_activities?.photoUrls || activity.photoUrls).length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-sm h-8 px-3 w-fit"
                      onClick={() => {
                        setSelectedActivity(activity);
                        setIsPhotoModalOpen(true);
                      }}
                      data-testid={`button-view-photos-${index}`}
                    >
                      <ImageIcon className="w-4 h-4 mr-1" />
                      {t("driver.activity.viewPhotos", { count: (activity.washout_activities?.photoUrls || activity.photoUrls).length })}
                    </Button>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <div className="flex items-center text-sm text-foreground/70">
                      <MapPin className="w-4 h-4 mr-1" />
                      <span>{t("driver.activity.gpsVerified")}</span>
                    </div>
                    {activity.verifiedAt && (
                      <div className="text-xs text-green-500">
                        {t("driver.activity.verifiedOn", { date: new Date(activity.verifiedAt).toLocaleDateString(language === "es" ? "es-US" : "en-US") })}
                      </div>
                    )}
                  </div>
              </DSCard>
              );
            })
          )}
        </div>
      </div>

      <MobileNav role="driver" />
      
      {/* Photo Modal */}
      <PhotoModal
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
        activity={selectedActivity}
        canApprove={false} // Drivers cannot approve/reject photos
      />
    </div>
  );
}
