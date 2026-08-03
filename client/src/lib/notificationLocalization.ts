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

export function localizeCenterNotification(notification: CenterNotification, _language: AppLanguage, t: Translate) {
  // Governed announcements contain Admin-authored plain text. Preserve that
  // authored content exactly; only system-authored lifecycle templates localize.
  if (!notification.templateKey || notification.templateKey === "system_announcement") {
    return { title: notification.title, message: notification.message };
  }
  const titleKey = `notification.template.${notification.templateKey}.title`;
  const messageKey = `notification.template.${notification.templateKey}.message`;
  const title = t(titleKey, notification.metadata);
  const message = t(messageKey, notification.metadata);
  return {
    title: title === titleKey ? notification.title : title,
    message: message === messageKey ? notification.message : message,
  };
}
