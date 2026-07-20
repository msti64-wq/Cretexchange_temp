import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgres://user:pass@127.0.0.1:1/cretexchange_test";

const { canTransitionRewardsPeriod, resolveRewardsPeriodForActivity } = await import("../server/rewardsPeriods");

const CUTOFF = "2026-07-17T05:00:00.000Z";
type PeriodState = "scheduled" | "active" | "paused" | "cancelled" | "completed";
type Role = "driver" | "owner" | "admin" | "super_admin";
type ActivityState = "pending" | "verified" | "rejected" | "cancelled";
type Actor = { id: string; role: Role };
type Activity = { id: string; driverId: string; ownerId: string; locationId: string; status: ActivityState; verifiedAt?: string; createdAt: string };
type Ticket = { id: string; activityId: string; driverId: string; ownerId: string; locationId: string; periodId: string; status: "eligible" | "ineligible" | "cancelled"; reason: string | null };

function fixture() {
  const period = { id: "period-2026-07", month: 7, year: 2026, status: "active" as PeriodState, completed: false, announcementSent: false };
  const current: Activity = { id: "activity-current", driverId: "driver-1", ownerId: "owner-1", locationId: "location-1", status: "verified", verifiedAt: CUTOFF, createdAt: "2026-07-01T00:00:00.000Z" };
  const historical: Activity = { ...current, id: "activity-historical", verifiedAt: "2026-07-17T04:59:59.000Z" };
  const tickets = new Map<string, Ticket>();
  const winners: Array<{ periodId: string; ticketId: string; driverId: string }> = [];
  const notifications: Array<{ periodId: string; driverId: string; type: "cancellation" | "winner" }> = [];
  const calls = { database: 0, stripe: 0, wallet: 0, transfer: 0, payout: 0, notification: 0 };
  const admin: Actor = { id: "admin-1", role: "admin" };
  const driver: Actor = { id: "driver-user-1", role: "driver" };
  const canAdminister = (actor: Actor) => actor.role === "admin" || actor.role === "super_admin";
  const isHistorical = (activity: Activity) => resolveRewardsPeriodForActivity(activity, CUTOFF)?.historical === true;

  function issueTicket(activity: Activity) {
    if (activity.status !== "verified") return { issued: false, reason: "activity_not_verified" as const };
    if (isHistorical(activity)) return { issued: false, reason: "historical_activity" as const };
    if (period.status !== "active") return { issued: false, reason: "period_not_active" as const };
    const existing = tickets.get(activity.id);
    if (existing) return { issued: true, ticket: existing, duplicate: true };
    const ticket: Ticket = { id: `ticket-${tickets.size + 1}`, activityId: activity.id, driverId: activity.driverId, ownerId: activity.ownerId, locationId: activity.locationId, periodId: period.id, status: "eligible", reason: null };
    tickets.set(activity.id, ticket);
    return { issued: true, ticket, duplicate: false };
  }

  function markIneligible(actor: Actor, ticket: Ticket, reason: string) {
    if (!canAdminister(actor)) return { code: "REWARDS_UNAUTHORIZED" as const };
    if (!reason.trim()) return { code: "INELIGIBILITY_REASON_REQUIRED" as const };
    ticket.status = "ineligible";
    ticket.reason = reason.trim();
    return { code: "updated" as const, ticket };
  }

  function transition(actor: Actor, to: PeriodState, reason?: string) {
    if (!canAdminister(actor)) return { code: "REWARDS_UNAUTHORIZED" as const };
    if (!canTransitionRewardsPeriod(period.status, to)) return { code: "REWARDS_INVALID_TRANSITION" as const };
    if (to === "cancelled" && !reason?.trim()) return { code: "CANCELLATION_REASON_REQUIRED" as const };
    period.status = to;
    if (to === "cancelled") {
      for (const ticket of tickets.values()) {
        ticket.status = "cancelled";
        ticket.reason = reason!.trim();
      }
    }
    return { code: "updated" as const };
  }

  function draw(actor: Actor) {
    if (!canAdminister(actor)) return { code: "REWARDS_UNAUTHORIZED" as const };
    if (period.status !== "active") return { code: "DRAW_PERIOD_NOT_ACTIVE" as const };
    if (period.completed) return { code: "DRAW_ALREADY_COMPLETED" as const };
    const eligible = [...tickets.values()].filter((ticket) => ticket.periodId === period.id && ticket.status === "eligible");
    if (!eligible.length) return { code: "DRAW_NO_ELIGIBLE_TICKETS" as const };
    const selected = eligible[0];
    winners.push({ periodId: period.id, ticketId: selected.id, driverId: selected.driverId });
    period.completed = true;
    period.status = "completed";
    if (!notifications.some((notification) => notification.periodId === period.id && notification.driverId === selected.driverId && notification.type === "winner")) {
      calls.notification += 1;
      notifications.push({ periodId: period.id, driverId: selected.driverId, type: "winner" });
    }
    return { code: "drawn" as const, winner: winners[0] };
  }

  function announceCancellation(actor: Actor) {
    if (!canAdminister(actor)) return { code: "REWARDS_UNAUTHORIZED" as const };
    if (period.status !== "cancelled") return { code: "CANCELLATION_REQUIRED" as const };
    if (period.announcementSent) return { code: "idempotent" as const };
    const recipients = new Set([...tickets.values()].map((ticket) => ticket.driverId));
    for (const driverId of recipients) {
      if (!notifications.some((notification) => notification.periodId === period.id && notification.driverId === driverId && notification.type === "cancellation")) {
        calls.notification += 1;
        notifications.push({ periodId: period.id, driverId, type: "cancellation" });
      }
    }
    period.announcementSent = true;
    return { code: "announced" as const };
  }

  function verifyWithRewards(activity: Activity, rewardsAvailable = true) {
    activity.status = "verified";
    const obligation = isHistorical(activity) ? null : { activityId: activity.id, status: "unpaid" as const };
    const rewards = rewardsAvailable ? issueTicket(activity) : { issued: false, reason: "rewards_unavailable" as const };
    return { verified: true, obligation, rewards };
  }

  const external = {
    database() { calls.database += 1; throw new Error("unexpected database access"); },
    stripe() { calls.stripe += 1; throw new Error("unexpected Stripe access"); },
    wallet() { calls.wallet += 1; throw new Error("unexpected wallet access"); },
    transfer() { calls.transfer += 1; throw new Error("unexpected transfer access"); },
    payout() { calls.payout += 1; throw new Error("unexpected payout access"); },
  };

  return { period, current, historical, tickets, winners, notifications, calls, admin, driver, issueTicket, markIneligible, transition, draw, announceCancellation, verifyWithRewards, external };
}

test("an active period issues exactly one eligible ticket for a current verified activity with complete relationships", () => {
  const state = fixture();
  const first = state.issueTicket(state.current);
  const repeat = state.issueTicket(state.current);
  assert.equal(first.issued, true);
  assert.equal(repeat.issued, true);
  assert.equal(state.tickets.size, 1);
  assert.deepEqual(first.ticket, { id: "ticket-1", activityId: "activity-current", driverId: "driver-1", ownerId: "owner-1", locationId: "location-1", periodId: "period-2026-07", status: "eligible", reason: null });
  assert.equal(repeat.duplicate, true);
});

test("historical, rejected, unverified, and cancelled activity never issue a current ticket", () => {
  const state = fixture();
  assert.deepEqual(state.issueTicket(state.historical), { issued: false, reason: "historical_activity" });
  assert.deepEqual(state.issueTicket({ ...state.current, id: "rejected", status: "rejected" }), { issued: false, reason: "activity_not_verified" });
  assert.deepEqual(state.issueTicket({ ...state.current, id: "pending", status: "pending" }), { issued: false, reason: "activity_not_verified" });
  assert.deepEqual(state.issueTicket({ ...state.current, id: "cancelled", status: "cancelled" }), { issued: false, reason: "activity_not_verified" });
  assert.equal(state.tickets.size, 0);
});

test("ticket eligibility requires a stable reason and cancelled periods cancel existing entries", () => {
  const state = fixture();
  const ticket = state.issueTicket(state.current).ticket!;
  assert.deepEqual(state.markIneligible(state.driver, ticket, "duplicate"), { code: "REWARDS_UNAUTHORIZED" });
  assert.deepEqual(state.markIneligible(state.admin, ticket, ""), { code: "INELIGIBILITY_REASON_REQUIRED" });
  assert.equal(state.markIneligible(state.admin, ticket, "duplicate evidence").code, "updated");
  assert.equal(ticket.status, "ineligible");
  assert.equal(ticket.reason, "duplicate evidence");
  assert.equal(state.transition(state.admin, "cancelled", "monthly program cancelled").code, "updated");
  assert.equal(ticket.status, "cancelled");
  assert.equal(ticket.reason, "monthly program cancelled");
});

test("scheduled, paused, cancelled, and completed periods cannot issue tickets or be drawn", () => {
  for (const status of ["scheduled", "paused", "cancelled", "completed"] as PeriodState[]) {
    const state = fixture();
    state.period.status = status;
    assert.equal(state.issueTicket(state.current).issued, false, status);
    assert.equal(state.draw(state.admin).code, "DRAW_PERIOD_NOT_ACTIVE", status);
  }
});

test("draws select only eligible tickets, preserve winner relationships, and cannot complete twice", () => {
  const state = fixture();
  const eligible = state.issueTicket(state.current).ticket!;
  const excluded = state.issueTicket({ ...state.current, id: "activity-excluded", driverId: "driver-2" }).ticket!;
  state.markIneligible(state.admin, excluded, "manual review");
  const result = state.draw(state.admin);
  assert.deepEqual(result, { code: "drawn", winner: { periodId: state.period.id, ticketId: eligible.id, driverId: eligible.driverId } });
  assert.equal(state.winners.length, 1);
  assert.equal(state.winners[0].ticketId, eligible.id);
  assert.equal(state.draw(state.admin).code, "DRAW_PERIOD_NOT_ACTIVE");
});

test("empty active periods cannot draw and duplicate draw requests are rejected safely", () => {
  const empty = fixture();
  assert.equal(empty.draw(empty.admin).code, "DRAW_NO_ELIGIBLE_TICKETS");
  const drawn = fixture();
  drawn.issueTicket(drawn.current);
  assert.equal(drawn.draw(drawn.admin).code, "drawn");
  assert.notEqual(drawn.draw(drawn.admin).code, "drawn");
  assert.equal(drawn.winners.length, 1);
});

test("cancelled-period announcements are idempotent and never duplicate notifications", () => {
  const state = fixture();
  state.issueTicket(state.current);
  state.transition(state.admin, "cancelled", "cancelled for operations");
  assert.equal(state.announceCancellation(state.admin).code, "announced");
  assert.equal(state.announceCancellation(state.admin).code, "idempotent");
  assert.equal(state.notifications.filter((notification) => notification.type === "cancellation").length, 1);
  assert.equal(state.calls.notification, 1);
});

test("rewards outages do not block verification or current canonical obligations", () => {
  const state = fixture();
  const result = state.verifyWithRewards({ ...state.current, id: "activity-rewards-outage", status: "pending" }, false);
  assert.equal(result.verified, true);
  assert.deepEqual(result.obligation, { activityId: "activity-rewards-outage", status: "unpaid" });
  assert.deepEqual(result.rewards, { issued: false, reason: "rewards_unavailable" });
  const historical = state.verifyWithRewards({ ...state.historical, id: "activity-historical-verified", status: "pending" });
  assert.equal(historical.obligation, null);
});

test("period administration is limited to Platform Operations administrators", () => {
  const state = fixture();
  assert.equal(state.transition(state.driver, "paused").code, "REWARDS_UNAUTHORIZED");
  assert.equal(state.draw(state.driver).code, "REWARDS_UNAUTHORIZED");
  assert.equal(state.announceCancellation(state.driver).code, "REWARDS_UNAUTHORIZED");
  assert.equal(state.transition(state.admin, "paused", "review").code, "updated");
  assert.equal(state.transition(state.admin, "active").code, "updated");
});

test("rewards never execute providers or financial transfers and unexpected external access fails immediately", () => {
  const state = fixture();
  state.issueTicket(state.current);
  state.draw(state.admin);
  assert.deepEqual(state.calls, { database: 0, stripe: 0, wallet: 0, transfer: 0, payout: 0, notification: 1 });
  assert.throws(() => state.external.database(), /unexpected database access/);
  assert.throws(() => state.external.stripe(), /unexpected Stripe access/);
  assert.throws(() => state.external.wallet(), /unexpected wallet access/);
  assert.throws(() => state.external.transfer(), /unexpected transfer access/);
  assert.throws(() => state.external.payout(), /unexpected payout access/);
});
