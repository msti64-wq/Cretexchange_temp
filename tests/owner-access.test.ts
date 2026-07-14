import assert from "node:assert/strict";
import test from "node:test";
import { resolveOwnerMembershipState } from "../shared/ownerMembership";
import { getMissingOwnerProfileFields, resolveDriverLocationVisibilityState, resolveOwnerLocationAccessState } from "../shared/ownerLocationAccess";
import { filterPendingWashoutApprovals, getWashoutApprovalDisplayStatus, isPendingWashoutApproval } from "../shared/washoutApproval";

function makeOwner(overrides: Record<string, unknown> = {}) {
  return {
    membershipStatus: null,
    isApproved: true,
    membershipPaymentMethod: null,
    subscriptionStatus: "inactive",
    walletStatus: "active",
    profileCompleted: true,
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

test("approved, complete Facility can manage locations without a payment method", () => {
  const owner = makeOwner({ membershipStatus: "active", stripePaymentMethodId: null });
  const membershipState = resolveOwnerMembershipState(owner);
  const locationState = resolveOwnerLocationAccessState(owner, makeUser());

  assert.equal(membershipState.dashboardAccessAllowed, true);
  assert.equal(locationState.canManageLocations, true);
  assert.equal(locationState.accessStatus, "operationally_ready");
});

test("incomplete owner profile is blocked with missing field labels", () => {
  const owner = makeOwner({ profileCompleted: false, companyName: "", businessLicense: "", taxId: "", stripePaymentMethodId: "pm_123" });
  const user = makeUser({ firstName: "", lastName: "", email: "", phone: "", street: "", city: "", state: "", zip: "" });

  const missingFields = getMissingOwnerProfileFields(owner, user);
  const locationState = resolveOwnerLocationAccessState(owner, user);

  assert.ok(missingFields.includes("firstName"));
  assert.ok(missingFields.includes("companyName"));
  assert.equal(locationState.canManageLocations, false);
  assert.ok(locationState.missingProfileFieldLabels.includes("First name"));
  assert.ok(locationState.missingProfileFieldLabels.includes("Company name"));
  assert.match(locationState.blockingMessage || "", /Missing:/i);
});

test("unapproved and malformed Facility records are denied safely", () => {
  const unapproved = resolveOwnerLocationAccessState(makeOwner({ isApproved: false, membershipStatus: "pending_review" }), makeUser());
  const activeMembershipWithoutApproval = resolveOwnerLocationAccessState(makeOwner({ isApproved: false, membershipStatus: "active" }), makeUser());
  const missingOwner = resolveOwnerLocationAccessState(null, makeUser());
  const missingUser = resolveOwnerLocationAccessState(makeOwner(), null);

  assert.equal(unapproved.canManageLocations, false);
  assert.equal(unapproved.accessStatus, "approval_pending");
  assert.equal(activeMembershipWithoutApproval.canManageLocations, false);
  assert.equal(activeMembershipWithoutApproval.accessStatus, "approval_pending");
  assert.equal(missingOwner.canManageLocations, false);
  assert.equal(missingOwner.accessStatus, "access_denied");
  assert.equal(missingUser.canManageLocations, false);
  assert.equal(missingUser.accessStatus, "access_denied");
});

test("payment-method presence does not alter operational location access", () => {
  const withoutPaymentMethod = resolveOwnerLocationAccessState(makeOwner({ stripePaymentMethodId: null }), makeUser());
  const owner = makeOwner({ stripePaymentMethodId: "pm_123" });
  const locationState = resolveOwnerLocationAccessState(owner, makeUser());

  assert.equal(withoutPaymentMethod.canManageLocations, true);
  assert.equal(locationState.canManageLocations, true);
  assert.equal(locationState.missingProfileFields.length, 0);
});

test("column and lithic legacy fields are not required for location setup", () => {
  const owner = makeOwner({
    stripePaymentMethodId: "pm_123",
    columnEntityId: null,
    columnAccountId: null,
    lithicAccountHolderToken: null,
    lithicFinancialAccountToken: null,
  });
  const locationState = resolveOwnerLocationAccessState(owner, makeUser());

  assert.equal(locationState.canManageLocations, true);
});

test("waived approved Facility with a complete profile can manage locations", () => {
  const owner = makeOwner({ membershipStatus: "waived", stripePaymentMethodId: null });
  const membershipState = resolveOwnerMembershipState(owner);
  const locationState = resolveOwnerLocationAccessState(owner, makeUser());

  assert.equal(membershipState.dashboardAccessAllowed, true);
  assert.equal(locationState.canManageLocations, true);
});

test("driver location visibility allows approved active owner locations", () => {
  const owner = makeOwner({ membershipStatus: "active", isApproved: false });
  const visibilityState = resolveDriverLocationVisibilityState(
    {
      id: "location_1",
      ownerId: "owner_1",
      name: "Site A",
      isActive: true,
      isVisible: true,
    },
    owner,
  );

  assert.equal(visibilityState.visibleToDrivers, true);
  assert.equal(visibilityState.ownerMembershipStatus, "active");
});

test("driver location visibility does not hide approved locations for billing or payment status", () => {
  const owner = makeOwner({
    membershipStatus: "active",
    isApproved: true,
    stripePaymentMethodId: null,
    subscriptionStatus: "past_due",
    walletStatus: "suspended",
    membershipPaymentMethod: "waived",
  });
  const visibilityState = resolveDriverLocationVisibilityState(
    {
      id: "location_4",
      ownerId: "owner_1",
      name: "Billable Site",
      isActive: true,
      isVisible: true,
    },
    owner as any,
  );

  assert.equal(visibilityState.visibleToDrivers, true);
  assert.equal(visibilityState.ownerMembershipStatus, "active");
});

test("driver location visibility logs hidden or inactive reasons", () => {
  const owner = makeOwner({ membershipStatus: "active" });

  const hiddenState = resolveDriverLocationVisibilityState(
    { id: "location_2", ownerId: "owner_1", name: "Hidden Site", isActive: true, isVisible: false },
    owner,
  );
  assert.equal(hiddenState.visibleToDrivers, false);
  assert.equal(hiddenState.exclusionReason, "location_hidden");

  const inactiveState = resolveDriverLocationVisibilityState(
    { id: "location_3", ownerId: "owner_1", name: "Inactive Site", isActive: false, isVisible: true },
    owner,
  );
  assert.equal(inactiveState.visibleToDrivers, false);
  assert.equal(inactiveState.exclusionReason, "location_inactive");
});

test("washout approval helper keeps legacy pending records visible", () => {
  const queue = filterPendingWashoutApprovals([
    { id: "old", status: "pending_owner_approval", createdAt: new Date("2026-05-26T10:00:00Z") },
    { id: "today", status: "pending", createdAt: new Date("2026-05-28T10:00:00Z") },
    { id: "photo", status: "photo_pending", createdAt: new Date("2026-05-24T10:00:00Z") },
    { id: "done", status: "verified", createdAt: new Date("2026-05-20T10:00:00Z") },
  ]);

  assert.equal(queue.length, 3);
  assert.equal(isPendingWashoutApproval(queue[0].status), true);
  assert.equal(getWashoutApprovalDisplayStatus(queue[0].status), "Pending Review");
  assert.equal(isPendingWashoutApproval("photo_pending"), true);
  assert.equal(isPendingWashoutApproval("submitted"), true);
  assert.equal(isPendingWashoutApproval("verified"), false);
});
