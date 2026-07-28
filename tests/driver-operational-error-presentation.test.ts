import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError, formatApiErrorMessage, getSafeApiErrorDetails } from "../client/src/lib/queryClient";
import { presentDriverOperationalError, resolveDriverOperationalErrorPresentation } from "../client/src/lib/driverOperationalErrorPresentation";

function error(payload: unknown, status = 409) {
  const text = JSON.stringify(payload);
  return new ApiRequestError(formatApiErrorMessage(status, "Conflict", text), getSafeApiErrorDetails(status, text));
}

test("structured API errors preserve backward-compatible messages with safe status and code metadata", () => {
  const payload = {
    message: "Complete your Driver account readiness before submitting operational activity.",
    code: "DRIVER_OPERATIONAL_READINESS_REQUIRED",
    readiness: { reasons: [{ code: "driver_profile_incomplete", missingProfileFields: ["street"] }] },
  };
  const value = error(payload);

  assert.ok(value instanceof Error);
  assert.equal(value.message, payload.message);
  assert.deepEqual(value.details, {
    status: 409,
    code: "DRIVER_OPERATIONAL_READINESS_REQUIRED",
    readinessReasonCodes: ["driver_profile_incomplete"],
  });
  assert.doesNotMatch(JSON.stringify(value.details), /missingProfileFields|street/);
});

test("non-JSON and unknown errors preserve existing messages without raw structured details", () => {
  assert.equal(formatApiErrorMessage(503, "Service Unavailable", "gateway unavailable"), "503: gateway unavailable");
  assert.deepEqual(getSafeApiErrorDetails(503, "gateway unavailable"), { status: 503 });

  const presentation = resolveDriverOperationalErrorPresentation(new Error("gateway unavailable"));
  assert.deepEqual(presentation, {
    kind: "unavailable",
    titleKey: "driver.error.unavailableTitle",
    descriptionKey: "driver.error.unavailableDescription",
    action: "retry",
  });
});

test("stable Driver readiness, location, and material codes map to safe recovery actions", () => {
  assert.equal(resolveDriverOperationalErrorPresentation(error({ code: "DRIVER_ROLE_REQUIRED" }, 403)).kind, "access_denied");
  for (const reason of ["driver_profile_required", "driver_profile_not_owned", "driver_profile_incomplete"]) {
    assert.equal(resolveDriverOperationalErrorPresentation(error({ code: "DRIVER_OPERATIONAL_READINESS_REQUIRED", readiness: { reasons: [{ code: reason }] } })).action, "profile");
  }
  assert.equal(resolveDriverOperationalErrorPresentation(error({ code: "DRIVER_OPERATIONAL_READINESS_REQUIRED", readiness: { reasons: [{ code: "current_terms_required" }] } })).action, "terms");
  for (const reason of ["active_material_required", "active_material_invalid", "active_material_retired"]) {
    assert.equal(resolveDriverOperationalErrorPresentation(error({ code: "DRIVER_OPERATIONAL_READINESS_REQUIRED", readiness: { reasons: [{ code: reason }] } })).action, "material");
  }
  assert.equal(resolveDriverOperationalErrorPresentation(error({ code: "DRIVER_LOCATION_NOT_ELIGIBLE" })).action, "locations");
  assert.equal(resolveDriverOperationalErrorPresentation(error({ code: "DRIVER_MATERIAL_MISMATCH" })).action, "material");
});

test("unauthenticated responses remain a reauthentication handoff instead of a retry presentation", () => {
  let reauthenticated = 0;
  const presentation = presentDriverOperationalError(error({ code: "UNAUTHENTICATED" }, 401), () => { reauthenticated += 1; });
  assert.equal(presentation.kind, "reauthenticate");
  assert.equal(presentation.action, "reauthenticate");
  assert.equal(reauthenticated, 1);
  presentDriverOperationalError(error({ code: "DRIVER_LOCATION_NOT_ELIGIBLE" }), () => { reauthenticated += 1; });
  assert.equal(reauthenticated, 1);
});
