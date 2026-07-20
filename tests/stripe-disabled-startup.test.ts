import assert from "node:assert/strict";
import test from "node:test";

// The process intentionally has no key. Importing the application-level
// Stripe adapter must not make an execution-disabled deployment fail to boot.
delete process.env.STRIPE_SECRET_KEY;

const stripeService = await import("../server/stripeService");

test("provider-disabled startup does not require a Stripe key", () => {
  assert.equal(typeof stripeService.getConfiguredStripeClient, "function");
  assert.throws(
    () => stripeService.getConfiguredStripeClient(),
    /Stripe is not configured\. Set STRIPE_SECRET_KEY before attempting a Stripe operation\./,
  );
});
