import assert from "node:assert/strict";
import test from "node:test";
import { resolveOwnerMembershipState } from "../shared/ownerMembership";
import { resolveOwnerLocationAccessState } from "../shared/ownerLocationAccess";

function makeOwner(overrides: Record<string, unknown> = {}) {
  return {
    membershipStatus: null,
    isApproved: true,
    membershipPaymentMethod: null,
    subscriptionStatus: "inactive",
    walletStatus: "active",
    profileCompleted: true,
    locationSetupOverride: false,
    stripePaymentMethodId: "pm_123",
    companyName: "Alpha Concrete",
    businessLicense: "BL-100",
    taxId: "12-3456789",
    ...overrides,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Olivia",
    lastName: "Owner",
    email: "olivia@example.com",
    phone: "555-0100",
    street: "1 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    ...overrides,
  };
}

test("active owner sees dashboard", () => {
  const state = resolveOwnerMembershipState(makeOwner({ membershipStatus: "active" }));
  assert.equal(state.dashboardAccessAllowed, true);
  assert.equal(state.membershipStatus, "active");
});

test("waived owner sees dashboard", () => {
  const state = resolveOwnerMembershipState(makeOwner({ membershipStatus: "waived" }));
  assert.equal(state.dashboardAccessAllowed, true);
  assert.equal(state.membershipStatus, "waived");
});

test("pending review owner sees approval message", () => {
  const state = resolveOwnerMembershipState(makeOwner({ membershipStatus: "pending_review", isApproved: false }));
  assert.equal(state.dashboardAccessAllowed, false);
  assert.equal(state.membershipStatus, "pending_review");
  assert.match(state.accountStatusMessage || "", /under review/i);
});

test("expired owner sees contact admin message", () => {
  const state = resolveOwnerMembershipState(makeOwner({ membershipStatus: "expired", isApproved: false }));
  assert.equal(state.dashboardAccessAllowed, false);
  assert.match(state.accountStatusMessage || "", /contact an administrator/i);
});

test("suspended owner sees contact admin message", () => {
  const state = resolveOwnerMembershipState(makeOwner({ membershipStatus: "suspended", isApproved: false }));
  assert.equal(state.dashboardAccessAllowed, false);
  assert.match(state.accountStatusMessage || "", /contact an administrator/i);
});

test("active owner missing card can see dashboard but cannot manage locations", () => {
  const owner = makeOwner({ membershipStatus: "active", stripePaymentMethodId: null });
  const membershipState = resolveOwnerMembershipState(owner);
  const locationState = resolveOwnerLocationAccessState(owner, makeUser());

  assert.equal(membershipState.dashboardAccessAllowed, true);
  assert.equal(locationState.canManageLocations, false);
  assert.match(locationState.blockingMessage || "", /add a payment method/i);
});

test("waived owner with profile complete and card on file can manage locations", () => {
  const owner = makeOwner({ membershipStatus: "waived", locationSetupOverride: false, stripePaymentMethodId: "pm_123" });
  const membershipState = resolveOwnerMembershipState(owner);
  const locationState = resolveOwnerLocationAccessState(owner, makeUser());

  assert.equal(membershipState.dashboardAccessAllowed, true);
  assert.equal(locationState.canManageLocations, true);
});
