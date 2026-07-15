import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DSCard, DSSectionHeader } from "@/components/design-system";
import { useLanguage } from "@/lib/i18n";
import type { DriverPaymentLifecyclePresentation } from "@/lib/driverPaymentLifecycle";

interface DriverLifecycleSummaryProps {
  lifecycle: DriverPaymentLifecyclePresentation;
  isLoading: boolean;
  paymentError?: boolean;
  onViewActivity: () => void;
  variant: "dashboard" | "wallet";
}

export function DriverLifecycleSummary({ lifecycle, isLoading, paymentError, onViewActivity, variant }: DriverLifecycleSummaryProps) {
  const { t } = useLanguage();
  const unavailableActivity = t(isLoading ? "driver.lifecycle.loading" : "driver.lifecycle.activityUnavailable");
  const unavailablePayment = t(isLoading || paymentError ? "driver.lifecycle.loading" : "driver.lifecycle.paymentUnavailable");
  const activityCard = (
    <DSCard padding="md">
      <h3 className="font-semibold">{t("driver.lifecycle.awaitingReview")}</h3>
      {lifecycle.awaitingReviewCount === null ? <p className="mt-2 text-sm text-muted-foreground">{unavailableActivity}</p> : <>
        <p className="mt-2 text-2xl font-semibold" data-testid={`text-${variant}-awaiting-review`}>{lifecycle.awaitingReviewCount}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("driver.lifecycle.waitingForFacilityReview")}</p>
      </>}
      <Button variant="outline" size="sm" className="mt-3" onClick={onViewActivity}>{t("driver.lifecycle.viewActivity")}<ArrowRight className="ml-1 h-4 w-4" /></Button>
    </DSCard>
  );
  const paymentCard = (
    <DSCard padding="md">
      <h3 className="font-semibold">{t("driver.lifecycle.verifiedAwaitingPayment")}</h3>
      {lifecycle.verifiedAwaitingPaymentCount === null ? <p className="mt-2 text-sm text-muted-foreground">{unavailablePayment}</p> : <p className="mt-2 text-2xl font-semibold" data-testid={`text-${variant}-verified-awaiting-payment`}>{lifecycle.verifiedAwaitingPaymentCount}</p>}
      <p className="mt-1 text-sm text-muted-foreground">{t("driver.lifecycle.verifiedAwaitingPaymentHelp")}</p>
      {lifecycle.paymentExceptionCount && lifecycle.paymentExceptionCount > 0 ? <p className="mt-2 text-sm text-amber-600">{t("driver.lifecycle.paymentException")}</p> : null}
      <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-border/70 p-2"><p className="font-medium">{t("driver.lifecycle.paymentScheduled")}</p><p className="mt-1 text-muted-foreground">{t("driver.lifecycle.schedulingUnavailable")}</p></div>
        <div className="rounded-lg border border-border/70 p-2"><p className="font-medium">{t("driver.lifecycle.paymentHistory")}</p><p className="mt-1 text-muted-foreground">{t("driver.lifecycle.paymentHistoryUnavailable")}</p></div>
      </div>
    </DSCard>
  );

  if (variant === "wallet") return <section className="space-y-3" data-testid="section-wallet-lifecycle"><DSSectionHeader title={t("driver.lifecycle.activityStatus")} /><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{activityCard}{paymentCard}</div></section>;
  return <><div data-testid="section-driver-payment-lifecycle">{activityCard}</div><div data-testid="section-driver-payment-status">{paymentCard}</div></>;
}
