import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { getDriverGeofencePresentation, type DriverGeofenceDisplayState } from "@/lib/driverGeofenceAdvisory";

export type { DriverGeofenceDisplayState, DriverGeofenceResult, DriverGeofenceState } from "@/lib/driverGeofenceAdvisory";

export function DriverGeofenceIndicator({ state, reasonCode }: { state: DriverGeofenceDisplayState; reasonCode?: string | null }) {
  const { t } = useLanguage();
  const content = getDriverGeofencePresentation(state, reasonCode);
  const presentation = content.tone === "green"
    ? { Icon: CheckCircle2, className: "border-emerald-700 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-100" }
    : content.tone === "yellow"
      ? { Icon: AlertTriangle, className: "border-amber-700 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950/50 dark:text-amber-100" }
      : content.tone === "red"
        ? { Icon: XCircle, className: "border-red-700 bg-red-50 text-red-950 dark:border-red-500 dark:bg-red-950/50 dark:text-red-100" }
        : { Icon: HelpCircle, className: "border-slate-600 bg-slate-50 text-slate-950 dark:border-slate-400 dark:bg-slate-900/60 dark:text-slate-100" };
  const label = t(content.labelKey);
  const guidance = t(content.guidanceKey);
  return (
    <div
      className={`mb-3 flex min-h-11 items-start gap-2 rounded-lg border px-3 py-2 text-sm ${presentation.className}`}
      role="status"
      aria-label={`${label}. ${guidance}`}
      data-testid="driver-geofence-status"
      data-geofence-tone={content.tone}
      data-geofence-state={state}
    >
      <span
        className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-current shadow-[0_0_0_2px_rgba(255,255,255,0.18)] ${
          content.tone === "green" ? "bg-emerald-400" : content.tone === "yellow" ? "bg-amber-300" : content.tone === "red" ? "bg-red-400" : "bg-slate-400"
        }`}
        aria-hidden="true"
        data-testid={`driver-geofence-light-${content.tone}`}
      />
      <presentation.Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-xs opacity-90">{guidance}</span>
      </span>
    </div>
  );
}
