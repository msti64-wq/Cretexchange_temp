import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export type DriverGeofenceState =
  | "INSIDE_APPROVED_BOUNDARY"
  | "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE"
  | "OUTSIDE_EXCEPTION_ZONE"
  | "LOCATION_UNAVAILABLE"
  | "LOCATION_ACCURACY_INSUFFICIENT"
  | "GEOMETRY_UNAVAILABLE"
  | "GEOMETRY_INVALID";

export function DriverGeofenceIndicator({ state }: { state: DriverGeofenceState }) {
  const { t } = useLanguage();
  const presentation = state === "INSIDE_APPROVED_BOUNDARY"
    ? { Icon: CheckCircle2, key: "geofence.driver.inside", className: "border-emerald-600/60 bg-emerald-950/30 text-emerald-300" }
    : state === "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE"
      ? { Icon: AlertTriangle, key: "geofence.driver.confirm", className: "border-amber-500/60 bg-amber-950/30 text-amber-200" }
      : state === "OUTSIDE_EXCEPTION_ZONE"
        ? { Icon: XCircle, key: "geofence.driver.tooFar", className: "border-red-500/60 bg-red-950/30 text-red-200" }
        : { Icon: HelpCircle, key: "geofence.driver.unavailable", className: "border-slate-500/60 bg-slate-900/40 text-slate-200" };
  return (
    <div className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${presentation.className}`} role="status" data-testid="driver-geofence-status">
      <presentation.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t(presentation.key)}</span>
    </div>
  );
}
