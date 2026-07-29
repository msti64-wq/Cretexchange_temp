import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { translations, translate } from "../client/src/lib/i18n";

const requiredKeys = [
  "install.title",
  "driver.material.system.concrete-washout",
  "driver.material.system.mixed-construction-demolition",
  "driver.material.category.soil-and-fill",
  "driver.notifications.title",
  "driver.notifications.markAllRead",
  "driver.wallet.paymentAccountStatus",
  "driver.wallet.requestWithdrawal",
  "driver.wallet.transactionHistory",
  "driver.rewards.center",
  "driver.rewards.ticketLedger",
  "driver.rewards.fulfillmentTitle",
] as const;

test("Driver account-surface localization has English and Spanish parity", () => {
  for (const key of requiredKeys) {
    for (const language of ["en", "es"] as const) {
      assert.ok(translations[language][key], `${language} is missing ${key}`);
      assert.notEqual(translate(key, language, { count: 2, date: "hoy", amount: "$5.00" }), key);
    }
  }

  assert.equal(translate("driver.material.system.concrete-washout", "es"), "Lavado de concreto");
  assert.equal(translate("driver.notifications.title", "es"), "Centro de mensajes");
  assert.equal(translate("driver.wallet.transactionHistory", "es"), "Historial de transacciones");
});

test("Driver material, rewards, wallet, messages, and install prompt use the shared catalog", () => {
  const materialSelector = readFileSync(new URL("../client/src/components/driver/DriverMaterialIntentSelector.tsx", import.meta.url), "utf8");
  const rewards = readFileSync(new URL("../client/src/pages/driver/rewards.tsx", import.meta.url), "utf8");
  const wallet = readFileSync(new URL("../client/src/pages/driver/wallet.tsx", import.meta.url), "utf8");
  const notifications = readFileSync(new URL("../client/src/pages/driver/notifications.tsx", import.meta.url), "utf8");
  const installPrompt = readFileSync(new URL("../client/src/components/InstallPrompt.tsx", import.meta.url), "utf8");

  assert.match(materialSelector, /driver\.material\.system\.\$\{material\.slug\}/);
  assert.match(materialSelector, /localizedMaterialCategory/);
  assert.match(rewards, /useLanguage/);
  assert.match(rewards, /driver\.rewards\.center/);
  assert.match(rewards, /formatLocalizedDate/);
  assert.match(wallet, /driver\.wallet\.paymentAccountStatus/);
  assert.match(wallet, /driver\.wallet\.requestWithdrawal/);
  assert.match(wallet, /driver\.wallet\.transactionHistory/);
  assert.match(notifications, /driver\.notifications\.title/);
  assert.match(installPrompt, /install\.title/);
  assert.doesNotMatch(rewards, />\s*Rewards Center\s*</);
  assert.doesNotMatch(wallet, /title="Payment Account Status"|title="Request Withdrawal"|title="Transaction History"/);
  assert.doesNotMatch(notifications, />Message Center</);
});
