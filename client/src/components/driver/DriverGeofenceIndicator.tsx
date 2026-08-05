import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { getDriverGeofencePresentation, type DriverGeofenceState } from "@/lib/driverGeofenceAdvisory";

export type { DriverGeofenceState } from "@/lib/driverGeofenceAdvisory";

export function DriverGeofenceIndicator({ state }: { state: DriverGeofenceState }) {
  const { t } = useLanguage();
  const content = getDriverGeofencePresentation(state);
  const presentation = content.tone === "green"
    ? { Icon: CheckCircle2, className: "border-emerald-600/60 bg-emerald-950/30 text-emerald-200" }
    : content.tone === "yellow"
      ? { Icon: AlertTriangle, className: "border-amber-500/60 bg-amber-950/30 text-amber-100" }
      : content.tone === "red"
        ? { Icon: XCircle, className: "border-red-500/60 bg-red-950/30 text-red-100" }
        : { Icon: HelpCircle, className: "border-slate-500/60 bg-slate-900/40 text-slate-100" };
  const label = t(content.labelKey);
  const guidance = t(content.guidanceKey);
  return (
    <div
      className={`mb-3 flex min-h-11 items-start gap-2 rounded-lg border px-3 py-2 text-sm ${presentation.className}`}
      role="status"
      aria-label={`${label}. ${guidance}`}
      data-testid="driver-geofence-status"
      data-geofence-tone={content.tone}
    >
      <presentation.Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-xs opacity-90">{guidance}</span>
      </span>
    </div>
  );
}
