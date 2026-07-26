import { useQuery } from "@tanstack/react-query";
import {
  buildDriverPaymentLifecycle,
  type DriverLifecycleActivity,
  type DriverLifecyclePayment,
} from "@/lib/driverPaymentLifecycle";

export function useDriverPaymentLifecycle({ enabled = true }: { enabled?: boolean } = {}) {
  const activities = useQuery<DriverLifecycleActivity[]>({
    queryKey: ["/api/drivers/activities"],
    refetchInterval: 30000,
    enabled,
  });
  const payments = useQuery<DriverLifecyclePayment[]>({
    queryKey: ["/api/drivers/payments"],
    refetchInterval: 30000,
    enabled,
  });

  return {
    lifecycle: buildDriverPaymentLifecycle(activities.data, payments.data),
    isLoading: activities.isLoading || payments.isLoading,
    activityError: activities.isError,
    paymentError: payments.isError,
    refresh: () => {
      if (!enabled) return;
      void activities.refetch();
      void payments.refetch();
    },
  };
}
