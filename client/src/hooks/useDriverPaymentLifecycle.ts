import { useQuery } from "@tanstack/react-query";
import {
  buildDriverPaymentLifecycle,
  type DriverLifecycleActivity,
  type DriverLifecyclePayment,
} from "@/lib/driverPaymentLifecycle";

export function useDriverPaymentLifecycle() {
  const activities = useQuery<DriverLifecycleActivity[]>({
    queryKey: ["/api/drivers/activities"],
    refetchInterval: 30000,
  });
  const payments = useQuery<DriverLifecyclePayment[]>({
    queryKey: ["/api/drivers/payments"],
    refetchInterval: 30000,
  });

  return {
    lifecycle: buildDriverPaymentLifecycle(activities.data, payments.data),
    isLoading: activities.isLoading || payments.isLoading,
    activityError: activities.isError,
    paymentError: payments.isError,
    refresh: () => {
      void activities.refetch();
      void payments.refetch();
    },
  };
}
