import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DriverPayoutSettings } from "../client/src/components/DriverPayoutSettings";
import {
  resolveDriverPayoutSettingsState,
  type DriverStripeRequirements,
} from "../client/src/lib/driverPayoutSettings";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

function renderDriverPayoutSettings(requirements?: DriverStripeRequirements) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });
  if (requirements) {
    queryClient.setQueryData(["/api/drivers/stripe-status"], requirements);
  }

  try {
    return renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(DriverPayoutSettings, { featureEnabled: true }),
      ),
    );
  } finally {
    queryClient.clear();
  }
}

test("Driver Dashboard consumes the canonical driver Stripe status endpoint", () => {
  const dashboardSource = readFileSync(new URL("../client/src/pages/driver/dashboard.tsx", import.meta.url), "utf8");

  assert.match(dashboardSource, /queryKey:\s*\['\/api\/drivers\/stripe-status'\]/);
  assert.doesNotMatch(dashboardSource, /\/api\/stripe\/connect\/account-status/);
});

test("legacy payouts_ready adapts to canonical payout_ready", () => {
  const state = resolveDriverPayoutSettingsState({
    featureEnabled: true,
    requirements: {
      hasAccount: true,
      status: "payouts_ready",
      payoutsEnabled: true,
    },
  });

  assert.equal(state.status, "payout_ready");
  assert.equal(state.statusLabel, "Payouts Ready");
});

test("missing settled Stripe data is unavailable rather than not_started", () => {
  const state = resolveDriverPayoutSettingsState({
    featureEnabled: true,
    requirements: undefined,
  });

  assert.equal(state.status, "status_unavailable");
  assert.equal(state.primaryAction.action, "view_stripe_status");
  assert.doesNotMatch(state.message, /not started/i);
});

test("DriverPayoutSettings keeps loading separate from not_started", () => {
  const html = renderDriverPayoutSettings();

  assert.match(html, /Loading/);
  assert.doesNotMatch(html, /Not Started|button-driver-connect-bank-account|button-driver-resume-stripe-onboarding/);
});

test("DriverPayoutSettings renders not_started", () => {
  const html = renderDriverPayoutSettings({ hasAccount: false, status: "not_started" });

  assert.match(html, /Not Started/);
  assert.match(html, /button-driver-connect-bank-account/);
});

test("DriverPayoutSettings renders setup_started", () => {
  const html = renderDriverPayoutSettings({ hasAccount: true, status: "setup_started" });

  assert.match(html, /Resume Onboarding/);
  assert.match(html, /button-driver-resume-stripe-onboarding/);
});

test("DriverPayoutSettings renders action_required", () => {
  const html = renderDriverPayoutSettings({ hasAccount: true, status: "action_required" });

  assert.match(html, /Action Required/);
  assert.match(html, /button-driver-resume-stripe-onboarding/);
});

test("DriverPayoutSettings renders payout_ready", () => {
  const html = renderDriverPayoutSettings({
    hasAccount: true,
    status: "payout_ready",
    payoutsEnabled: true,
    chargesEnabled: false,
  });

  assert.match(html, /Payouts Ready/);
  assert.match(html, /button-driver-view-stripe-status/);
  assert.doesNotMatch(html, /button-driver-connect-bank-account|button-driver-resume-stripe-onboarding/);
});

test("DriverPayoutSettings renders status_unavailable without onboarding", () => {
  const html = renderDriverPayoutSettings({ hasAccount: true, status: "status_unavailable" });

  assert.match(html, /Status Unavailable/);
  assert.match(html, /button-driver-view-stripe-status/);
  assert.doesNotMatch(html, /button-driver-connect-bank-account|button-driver-resume-stripe-onboarding/);
});

test("DriverPayoutSettings renders account_conflict without onboarding", () => {
  const html = renderDriverPayoutSettings({ hasAccount: true, status: "account_conflict" });

  assert.match(html, /Account Conflict/);
  assert.match(html, /button-driver-view-stripe-status/);
  assert.doesNotMatch(html, /button-driver-connect-bank-account|button-driver-resume-stripe-onboarding/);
});

test("MD1 reconciled Stripe account renders Payouts Ready", () => {
  const md1CanonicalStatus: DriverStripeRequirements = {
    hasAccount: true,
    status: "payout_ready",
    onboardingComplete: true,
    payoutsEnabled: true,
    chargesEnabled: false,
    detailsSubmitted: true,
  };
  const html = renderDriverPayoutSettings(md1CanonicalStatus);

  assert.match(html, /Payouts Ready/);
  assert.match(html, /button-driver-view-stripe-status/);
  assert.doesNotMatch(html, /Not Started|button-driver-connect-bank-account|button-driver-resume-stripe-onboarding/);
});
