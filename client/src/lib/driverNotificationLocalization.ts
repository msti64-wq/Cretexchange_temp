import type { AppLanguage } from "@/lib/i18n";

type Translate = (key: string, values?: Record<string, string | number>) => string;

export type DriverNotificationView = {
  title: string;
  message: string;
};

export function localizeDriverNotification(
  notification: { title?: string; message?: string; type?: string; data?: Record<string, unknown> | null },
  language: AppLanguage,
  t: Translate,
): DriverNotificationView {
  const original = {
    title: notification.title || "",
    message: notification.message || "",
  };
  if (language === "en") return original;

  const data = notification.data || {};
  if (notification.type === "lottery_winner") {
    return {
      title: t("messages.system.rewardWinnerTitle"),
      // Admin-authored winner messages are preserved as authored.
      message: data.sentBy || data.authored ? original.message : t("messages.system.rewardWinnerBody"),
    };
  }
  if (notification.type === "lottery_drawing_complete" || (notification.type === "lottery_announcement" && data.month && data.year)) {
    return {
      title: t("messages.system.drawingCompleteTitle"),
      message: t("messages.system.drawingCompleteBody", {
        month: String(data.month),
        year: String(data.year),
      }),
    };
  }
  if (notification.type === "lottery_announcement" || notification.type === "lottery_entry") {
    return {
      title: t("messages.system.rewardsUpdateTitle"),
      message: t("messages.system.rewardsUpdateBody"),
    };
  }

  const exact: Record<string, [string, string]> = {
    "Bank Account Connected": ["messages.system.bankConnectedTitle", "messages.system.bankConnectedBody"],
    "Account Setup Required": ["messages.system.accountSetupTitle", "messages.system.accountSetupBody"],
    "Bank Account Disconnected": ["messages.system.bankDisconnectedTitle", "messages.system.bankDisconnectedBody"],
  };
  const known = exact[original.title];
  if (known) return { title: t(known[0]), message: t(known[1]) };

  if (["payment", "payment_succeeded"].includes(notification.type || "")) {
    return { title: t("messages.system.paymentTitle"), message: t("messages.system.paymentBody") };
  }

  // Unknown content may be user-authored; never silently rewrite it.
  return original;
}
