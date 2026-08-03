import { useAuth } from "@/hooks/useAuth";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

export default function AdminNotifications() {
  const { user } = useAuth();
  return <NotificationCenter role={(user as any)?.role === "super_admin" ? "super_admin" : "admin"} />;
}
