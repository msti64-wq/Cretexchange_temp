import type { AppLanguage } from "./i18n";

type Translate = (key: string, values?: Record<string, string | number>) => string;

export type CenterNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  category: string;
  templateKey: string | null;
  isRead: boolean;
  deepLink: string | null;
  priority: string;
  metadata: Record<string, string>;
  createdAt: string | null;
};

const grayTemplateKeys = new Set([
  "geofence_uncertainty_submitted",
  "owner_geofence_uncertainty_review",
  "admin_geofence_uncertainty_attention",
]);

const grayStatuses = new Set([
  "gps_unavailable",
  "gps_accuracy_insufficient",
  "near_boundary_uncertainty",
  "near_advisory_limit_uncertainty",
  "boundary_unavailable",
  "boundary_invalid",
]);

function localizedMetadata(notification: CenterNotification, t: Translate): Record<string, string | number> {
  const metadata: Record<string, string | number> = { ...notification.metadata };
  if ([
    "geofence_exception_submitted",
    "owner_geofence_exception_review",
    "admin_geofence_exception_attention",
  ].includes(notification.templateKey || "")) {
    const reasonCode = notification.metadata.acknowledgementReasonCode || "OTHER";
    const reasonKey = `notification.geofence.acknowledgement.${reasonCode}`;
    const reason = t(reasonKey);
    metadata.acknowledgementReason = reason === reasonKey
      ? t("notification.geofence.acknowledgement.OTHER")
      : reason;
    metadata.driverNoteSuffix = notification.metadata.driverNote
      ? t("notification.geofence.driverNoteSuffix", { driverNote: notification.metadata.driverNote })
      : "";
    metadata.boundaryCorrectionSuffix = notification.metadata.boundaryCorrection === "true"
      ? t("notification.geofence.boundaryCorrectionSuffix")
      : "";
  }
  return metadata;
}

export function localizeCenterNotification(notification: CenterNotification, _language: AppLanguage, t: Translate) {
  // Governed announcements contain Admin-authored plain text. Preserve that
  // authored content exactly; only system-authored lifecycle templates localize.
  if (!notification.templateKey || notification.templateKey === "system_announcement") {
    return { title: notification.title, message: notification.message };
  }
  const status = notification.metadata.status;
  const variant = grayTemplateKeys.has(notification.templateKey) && grayStatuses.has(status)
    ? `.${status}`
    : "";
  const titleKey = `notification.template.${notification.templateKey}${variant}.title`;
  const messageKey = `notification.template.${notification.templateKey}${variant}.message`;
  const metadata = localizedMetadata(notification, t);
  const title = t(titleKey, metadata);
  const message = t(messageKey, metadata);
  return {
    title: title === titleKey ? notification.title : title,
    message: message === messageKey ? notification.message : message,
  };
}
