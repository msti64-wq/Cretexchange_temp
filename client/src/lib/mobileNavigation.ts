import {
  BarChart3,
  Bell,
  FileText,
  Flag,
  Globe2,
  Images,
  Landmark,
  Settings,
  Trophy,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { getSuperAdminHubForPath, SUPERADMIN_HUB_PATHS, type SuperAdminHubId } from "@/lib/superAdminNavigation";

export type MobileNavRole = "driver" | "owner" | "admin" | "super_admin" | undefined;

export type MobileNavItem = {
  path: string;
  icon: LucideIcon;
  label: string;
  testIdLabel?: string;
  hub?: SuperAdminHubId;
  wrapLabel?: boolean;
};

export function getSuperAdminConsolidatedNavigationItems(
  t: (key: string) => string,
): MobileNavItem[] {
  return [
    { path: "/", icon: BarChart3, label: t("adminNav.dashboard") },
    { path: SUPERADMIN_HUB_PATHS["users-locations"], icon: Users, label: t("adminNav.usersLocations"), testIdLabel: "users-locations", hub: "users-locations", wrapLabel: true },
    { path: "/reports", icon: BarChart3, label: t("adminNav.reports"), testIdLabel: "activity-reports" },
    { path: "/network-intelligence", icon: Globe2, label: t("network.nav"), testIdLabel: "network-intelligence" },
    { path: SUPERADMIN_HUB_PATHS.financials, icon: Landmark, label: t("adminNav.financials"), testIdLabel: "financials", hub: "financials", wrapLabel: true },
    { path: "/admin/administration-repository", icon: FileText, label: t("adminNav.operationsLibrary"), testIdLabel: "administration-repository" },
    { path: "/admin/photo-review", icon: Images, label: t("adminNav.photoReview"), testIdLabel: "photo-review" },
    { path: "/notifications", icon: Bell, label: t("nav.alerts"), testIdLabel: "alerts" },
    { path: "/lottery", icon: Trophy, label: t("adminNav.rewardsProgram") },
    { path: "/feature-flags", icon: Flag, label: t("adminNav.features") },
    { path: "/settings", icon: Wrench, label: t("adminNav.settings") },
    { path: "/profile", icon: Settings, label: t("adminNav.profile") },
  ];
}

export function isMobileNavItemActive(
  location: string,
  itemPath: string,
  role?: MobileNavRole,
  hub?: MobileNavItem["hub"],
): boolean {
  if (role === "super_admin" && hub) return getSuperAdminHubForPath(location) === hub;
  return location === itemPath || (itemPath === "/messages" && location === "/notifications");
}
