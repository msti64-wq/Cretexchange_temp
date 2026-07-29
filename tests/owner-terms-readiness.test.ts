import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveOwnerTermsReadiness } from "../client/src/lib/ownerTermsReadiness";
import { translations } from "../client/src/lib/i18n";

test("owner terms readiness distinguishes loading, accepted, required, unavailable, and ordinary failure", () => {
  assert.equal(resolveOwnerTermsReadiness({ isLoading: true, isError: false }), "loading");
  assert.equal(resolveOwnerTermsReadiness({ status: { hasAgreed: true }, isLoading: false, isError: false }), "accepted");
  assert.equal(resolveOwnerTermsReadiness({ status: { hasAgreed: false }, isLoading: false, isError: false }), "required");
  assert.equal(resolveOwnerTermsReadiness({ isLoading: false, isError: true, errorCode: "TERMS_LEDGER_UNAVAILABLE" }), "unavailable");
  assert.equal(resolveOwnerTermsReadiness({ isLoading: false, isError: true, errorCode: "UNEXPECTED" }), "error");
});

test("Owner profile exposes an actionable terms path independently of approval and financial setup", () => {
  const source = readFileSync(new URL("../client/src/pages/owner/profile.tsx", import.meta.url), "utf8");
  assert.match(source, /\/api\/owners\/terms-status\?language=\$\{encodeURIComponent\(language\)\}/);
  assert.match(source, /button-accept-owner-terms/);
  assert.match(source, /button-retry-owner-terms/);
  assert.match(source, /readOnly=\{ownerTermsReadiness === "accepted"\}/);
  assert.match(source, /enabled: Boolean\(user\?\.id\)/);
  assert.ok(source.indexOf('card-owner-terms-readiness') < source.indexOf('card-owner-optional-financial-setup'));
  assert.match(source, /t\("owner\.profile\.optionalFinancialSetupDescription"\)/);
  assert.match(source, /t\("owner\.profile\.paymentSettingsHelp"\)/);
});

test("Owner consent recovery copy has English and Spanish parity", () => {
  const keys = [
    "owner.terms.title",
    "owner.terms.loading",
    "owner.terms.accepted",
    "owner.terms.required",
    "owner.terms.review",
    "owner.terms.reviewAndAccept",
    "owner.terms.unavailable",
    "owner.terms.unavailableDescription",
    "owner.terms.errorDescription",
    "owner.terms.acceptanceFailed",
  ];
  for (const key of keys) {
    assert.ok(translations.en[key], `missing English ${key}`);
    assert.ok(translations.es[key], `missing Spanish ${key}`);
  }
});

test("Owner profile localization covers Spanish consent, readiness recovery, and optional financial setup", () => {
  for (const key of [
    "owner.terms.required",
    "owner.terms.reviewAndAccept",
    "owner.terms.unavailableDescription",
    "owner.profile.optionalFinancialSetup",
    "owner.profile.optionalFinancialSetupDescription",
    "owner.profile.paymentSettings",
    "owner.profile.paymentSettingsHelp",
  ]) {
    assert.ok(translations.en[key], `missing English ${key}`);
    assert.ok(translations.es[key], `missing Spanish ${key}`);
  }
  assert.match(translations.es["owner.profile.optionalFinancialSetupDescription"], /independiente de la preparación operativa/i);
  assert.match(translations.es["owner.terms.reviewAndAccept"], /Revisar y aceptar/i);
});

test("Owner profile keeps optional financial setup visually and semantically separate from readiness", () => {
  const profile = readFileSync(new URL("../client/src/pages/owner/profile.tsx", import.meta.url), "utf8");
  assert.match(profile, /Optional Stripe verification information is not operational readiness/);
  assert.match(profile, /Optional payment settings remain separate from operational readiness/);
  assert.doesNotMatch(profile, /StripeVerificationStatus/);
  assert.match(profile, /t\("owner\.profile\.optionalFinancialSetupDescription"\)/);
});

test("Owner terms dialog retains retryable, localized ledger-unavailable feedback", () => {
  const source = readFileSync(new URL("../client/src/components/OwnerTermsDialog.tsx", import.meta.url), "utf8");
  assert.match(source, /TERMS_LEDGER_UNAVAILABLE/);
  assert.match(source, /text-owner-terms-acceptance-error/);
  assert.match(source, /POST", "\/api\/owners\/agree-to-terms/);
});
