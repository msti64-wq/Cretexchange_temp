import type { ActivityGeofenceEvaluation } from "@shared/schema";
import type {
  CreateStructuredNotification,
} from "./notificationService";
import type {
  NotificationRole,
} from "@shared/notifications";
import { adminPhotoReviewActivityLink, sanitizeNotificationTextSnippet } from "@shared/notifications";

export const GEOFENCE_GRAY_NOTIFICATION_CONDITIONS = [
  "gps_unavailable",
  "gps_accuracy_insufficient",
  "near_boundary_uncertainty",
  "near_advisory_limit_uncertainty",
  "boundary_unavailable",
  "boundary_invalid",
] as const;

export type GeofenceGrayNotificationCondition = typeof GEOFENCE_GRAY_NOTIFICATION_CONDITIONS[number];
export type CompletedSubmissionGeofenceNotification =
  | { kind: "yellow" }
  | { kind: "gray"; condition: GeofenceGrayNotificationCondition };

type UserEmitter = (input: CreateStructuredNotification) => Promise<void>;
type RoleEmitter = (
  input: Omit<CreateStructuredNotification, "userId" | "recipientRole"> & { recipientRole: NotificationRole },
) => Promise<void>;

export type CompletedSubmissionNotificationInput = {
  enabled: boolean;
  activity: { id: string; status: string; driverUserId: string };
  facility: { id: string; name: string; resolveOwnerUserId: () => Promise<string | null> };
  retainedPhotoCount: number;
  evaluation: ActivityGeofenceEvaluation | null;
  emitUser: UserEmitter;
  emitRole: RoleEmitter;
  recordFailure?: (evidence: GeofenceNotificationFailureEvidence) => void;
};

export type GeofenceNotificationFailureEvidence = {
  activityId: string;
  recipientRole: NotificationRole;
  templateKey: string;
  errorCategory: string;
};

export type CompletedSubmissionNotificationResult = {
  handled: boolean;
  classification: CompletedSubmissionGeofenceNotification | null;
  attempted: number;
  failed: number;
};

const acknowledgementReasonLabels: Record<string, string> = {
  FACILITY_PERSONNEL_DIRECTED: "Facility personnel directed the Driver",
  APPROVED_AREA_INACCESSIBLE: "The approved area was inaccessible",
  BOUNDARY_APPEARS_INCORRECT: "The Facility boundary appears incorrect",
  GPS_APPEARS_INACCURATE: "The GPS reading appears inaccurate",
  OTHER: "Another operational reason was provided",
};

function boundedSafeDriverNote(value: string | null | undefined): string | null {
  const safe = sanitizeNotificationTextSnippet(value);
  return safe || null;
}

export function classifyCompletedSubmissionGeofenceNotification(
  evaluation: Pick<ActivityGeofenceEvaluation, "evaluationPurpose" | "resultState" | "reasonCode"> | null,
): CompletedSubmissionGeofenceNotification | null {
  if (!evaluation || evaluation.evaluationPurpose !== "submission") return null;
  if (evaluation.resultState === "OUTSIDE_BOUNDARY_WITHIN_EXCEPTION_ZONE") return { kind: "yellow" };
  if (evaluation.resultState === "LOCATION_UNAVAILABLE") return { kind: "gray", condition: "gps_unavailable" };
  if (evaluation.resultState === "LOCATION_ACCURACY_INSUFFICIENT") {
    if (evaluation.reasonCode === "LOCATION_UNCERTAINTY_OVERLAPS_BOUNDARY") {
      return { kind: "gray", condition: "near_boundary_uncertainty" };
    }
    if (evaluation.reasonCode === "LOCATION_UNCERTAINTY_OVERLAPS_EXCEPTION_THRESHOLD") {
      return { kind: "gray", condition: "near_advisory_limit_uncertainty" };
    }
    return { kind: "gray", condition: "gps_accuracy_insufficient" };
  }
  if (evaluation.resultState === "GEOMETRY_UNAVAILABLE") return { kind: "gray", condition: "boundary_unavailable" };
  if (evaluation.resultState === "GEOMETRY_INVALID") return { kind: "gray", condition: "boundary_invalid" };
  return null;
}

function yellowMessage(input: CompletedSubmissionNotificationInput, role: NotificationRole): string {
  const reasonCode = input.evaluation?.exceptionAcknowledgementCode || "OTHER";
  const reason = acknowledgementReasonLabels[reasonCode] || acknowledgementReasonLabels.OTHER;
  const note = boundedSafeDriverNote(input.evaluation?.driverNote);
  const correction = reasonCode === "BOUNDARY_APPEARS_INCORRECT"
    ? " This is a Facility boundary-correction request."
    : "";
  const noteText = note ? ` Driver note: ${note}.` : "";
  if (role === "driver") {
    return `Your Material Recovery Activity at ${input.facility.name} was submitted for Facility review. Boundary acknowledgement: ${reason}.${noteText}${correction}`;
  }
  if (role === "owner") {
    return `A Material Recovery Activity at ${input.facility.name} needs boundary review. Driver acknowledgement: ${reason}.${noteText}${correction}`;
  }
  return `A completed Material Recovery Activity at ${input.facility.name} needs low-priority boundary assistance. Driver acknowledgement: ${reason}.${noteText}${correction}`;
}

const grayCopy: Record<GeofenceGrayNotificationCondition, {
  driver: { title: string; message: string };
  owner: { title: string; message: string };
  admin: { title: string; message: string };
}> = {
  gps_unavailable: {
    driver: { title: "Activity submitted with location unavailable", message: "Your activity was submitted. Contact the Facility Owner for assistance if operational location needs verification." },
    owner: { title: "Activity needs location review", message: "Location was unavailable for a completed activity. Review the retained submission evidence and verify the operational location." },
    admin: { title: "Location assistance requested", message: "A completed activity has unavailable location evidence. Provide low-priority assistance if the Facility or Driver requests help." },
  },
  gps_accuracy_insufficient: {
    driver: { title: "Activity submitted with limited location accuracy", message: "Your activity was submitted with limited GPS accuracy. The Facility will review the retained evidence." },
    owner: { title: "Activity needs GPS accuracy review", message: "GPS accuracy was insufficient for a completed activity. Review the retained evidence and verify the operational location." },
    admin: { title: "GPS accuracy assistance requested", message: "A completed activity has insufficient GPS accuracy. Provide low-priority assistance if additional review is needed." },
  },
  near_boundary_uncertainty: {
    driver: { title: "Activity submitted near the Facility boundary", message: "Location uncertainty overlaps the Facility boundary. Your activity was submitted for evidence review." },
    owner: { title: "Activity needs near-boundary review", message: "Location uncertainty overlaps the Facility boundary. Review the retained submission evidence." },
    admin: { title: "Near-boundary assistance requested", message: "A completed activity has location uncertainty overlapping the Facility boundary. Provide low-priority assistance if requested." },
  },
  near_advisory_limit_uncertainty: {
    driver: { title: "Activity submitted near the advisory limit", message: "Location uncertainty overlaps the advisory-limit threshold. Your activity was submitted for evidence review." },
    owner: { title: "Activity needs advisory-limit review", message: "Location uncertainty overlaps the advisory-limit threshold. Review the retained submission evidence." },
    admin: { title: "Advisory-limit assistance requested", message: "A completed activity has uncertainty near the advisory-limit threshold. Provide low-priority assistance if requested." },
  },
  boundary_unavailable: {
    driver: { title: "Activity submitted while the Facility boundary was unavailable", message: "Your activity was submitted. Contact the Facility Owner if boundary assistance is needed." },
    owner: { title: "Facility boundary needs attention", message: "A completed activity could not use an available Facility boundary. Review the evidence and configure or correct the Facility boundary." },
    admin: { title: "Facility boundary assistance requested", message: "A completed activity could not use an available Facility boundary. Provide low-priority configuration assistance." },
  },
  boundary_invalid: {
    driver: { title: "Activity submitted while the Facility boundary needed correction", message: "Your activity was submitted. Contact the Facility Owner if boundary assistance is needed." },
    owner: { title: "Facility boundary correction needed", message: "A completed activity could not use the current Facility boundary. Review the evidence and correct the Facility boundary." },
    admin: { title: "Facility boundary correction assistance requested", message: "A completed activity encountered an invalid or unavailable Facility boundary. Provide low-priority correction assistance." },
  },
};

function metadata(input: CompletedSubmissionNotificationInput, classification: CompletedSubmissionGeofenceNotification) {
  const reasonCode = input.evaluation?.exceptionAcknowledgementCode || null;
  return {
    facilityName: input.facility.name,
    status: classification.kind === "yellow" ? "yellow_boundary_review" : classification.condition,
    acknowledgementReasonCode: classification.kind === "yellow" ? reasonCode : null,
    driverNote: classification.kind === "yellow" ? boundedSafeDriverNote(input.evaluation?.driverNote) : null,
    boundaryCorrection: classification.kind === "yellow" && reasonCode === "BOUNDARY_APPEARS_INCORRECT",
  };
}

function driverActivityLink(activityId: string): string {
  return `/activity?submittedActivityId=${encodeURIComponent(activityId)}`;
}

function ownerReviewLink(facilityId: string, activityId: string): string {
  const encodedActivityId = encodeURIComponent(activityId);
  return `/dashboard/reviews?facilityId=${encodeURIComponent(facilityId)}&activityId=${encodedActivityId}#activity-${encodedActivityId}`;
}

export async function deliverCompletedSubmissionGeofenceNotifications(
  input: CompletedSubmissionNotificationInput,
): Promise<CompletedSubmissionNotificationResult> {
  const evaluation = input.evaluation;
  const classification = classifyCompletedSubmissionGeofenceNotification(evaluation);
  const persistedCompletedSubmission = Boolean(
    input.enabled
    && input.activity.status === "pending"
    && input.retainedPhotoCount > 0
    && evaluation?.activityId === input.activity.id
    && classification,
  );
  if (!persistedCompletedSubmission || !classification || !evaluation) {
    return { handled: false, classification, attempted: 0, failed: 0 };
  }

  const eventKey = classification.kind === "yellow"
    ? "completed-yellow"
    : `completed-gray-${classification.condition}`;
  const safeMetadata = metadata(input, classification);
  const deliveries: Array<{ recipientRole: NotificationRole; templateKey: string; deliver: () => Promise<void> }> = [];

  if (classification.kind === "yellow") {
    deliveries.push({ recipientRole: "driver", templateKey: "geofence_exception_submitted", deliver: () => input.emitUser({
      userId: input.activity.driverUserId, recipientRole: "driver", templateKey: "geofence_exception_submitted",
      title: "Boundary review submitted", message: yellowMessage(input, "driver"), deepLink: driverActivityLink(input.activity.id),
      metadata: safeMetadata, sourceEntityType: "washout_activity", sourceEntityId: input.activity.id,
      idempotencyKey: `activity:${input.activity.id}:geofence:${eventKey}:driver:geofence_exception_submitted:${input.activity.driverUserId}`,
    }) });
    deliveries.push({ recipientRole: "owner", templateKey: "owner_geofence_exception_review", deliver: async () => {
      const ownerUserId = await input.facility.resolveOwnerUserId();
      if (!ownerUserId) return;
      await input.emitUser({
        userId: ownerUserId, recipientRole: "owner", templateKey: "owner_geofence_exception_review",
        title: "Activity needs boundary review", message: yellowMessage(input, "owner"), deepLink: ownerReviewLink(input.facility.id, input.activity.id),
        metadata: safeMetadata, sourceEntityType: "washout_activity", sourceEntityId: input.activity.id,
        idempotencyKey: `activity:${input.activity.id}:geofence:${eventKey}:owner:owner_geofence_exception_review:${ownerUserId}`,
        priority: "high",
      });
    } });
    for (const recipientRole of ["admin", "super_admin"] as const) {
      deliveries.push({ recipientRole, templateKey: "admin_geofence_exception_attention", deliver: () => input.emitRole({
        recipientRole, templateKey: "admin_geofence_exception_attention", title: "Facility boundary review assistance",
        message: yellowMessage(input, recipientRole), deepLink: adminPhotoReviewActivityLink(input.activity.id) || undefined, metadata: safeMetadata,
        sourceEntityType: "washout_activity", sourceEntityId: input.activity.id,
        idempotencyKey: `activity:${input.activity.id}:geofence:${eventKey}:${recipientRole}:admin_geofence_exception_attention`,
        priority: "normal",
      }) });
    }
  } else {
    const copy = grayCopy[classification.condition];
    deliveries.push({ recipientRole: "driver", templateKey: "geofence_uncertainty_submitted", deliver: () => input.emitUser({
      userId: input.activity.driverUserId, recipientRole: "driver", templateKey: "geofence_uncertainty_submitted",
      title: copy.driver.title, message: `${copy.driver.message} Facility: ${input.facility.name}.`, deepLink: driverActivityLink(input.activity.id),
      metadata: safeMetadata, sourceEntityType: "washout_activity", sourceEntityId: input.activity.id,
      idempotencyKey: `activity:${input.activity.id}:geofence:${eventKey}:driver:geofence_uncertainty_submitted:${input.activity.driverUserId}`,
    }) });
    deliveries.push({ recipientRole: "owner", templateKey: "owner_geofence_uncertainty_review", deliver: async () => {
      const ownerUserId = await input.facility.resolveOwnerUserId();
      if (!ownerUserId) return;
      await input.emitUser({
        userId: ownerUserId, recipientRole: "owner", templateKey: "owner_geofence_uncertainty_review",
        title: copy.owner.title, message: `${copy.owner.message} Facility: ${input.facility.name}.`, deepLink: ownerReviewLink(input.facility.id, input.activity.id),
        metadata: safeMetadata, sourceEntityType: "washout_activity", sourceEntityId: input.activity.id,
        idempotencyKey: `activity:${input.activity.id}:geofence:${eventKey}:owner:owner_geofence_uncertainty_review:${ownerUserId}`,
        priority: "high",
      });
    } });
    for (const recipientRole of ["admin", "super_admin"] as const) {
      deliveries.push({ recipientRole, templateKey: "admin_geofence_uncertainty_attention", deliver: () => input.emitRole({
        recipientRole, templateKey: "admin_geofence_uncertainty_attention", title: copy.admin.title,
        message: `${copy.admin.message} Facility: ${input.facility.name}.`, deepLink: adminPhotoReviewActivityLink(input.activity.id) || undefined,
        metadata: safeMetadata, sourceEntityType: "washout_activity", sourceEntityId: input.activity.id,
        idempotencyKey: `activity:${input.activity.id}:geofence:${eventKey}:${recipientRole}:admin_geofence_uncertainty_attention`,
        priority: "normal",
      }) });
    }
  }

  const outcomes = await Promise.allSettled(deliveries.map((delivery) => delivery.deliver()));
  let failed = 0;
  outcomes.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") return;
    failed += 1;
    const delivery = deliveries[index];
    const evidence: GeofenceNotificationFailureEvidence = {
      activityId: input.activity.id,
      recipientRole: delivery.recipientRole,
      templateKey: delivery.templateKey,
      errorCategory: outcome.reason instanceof Error ? outcome.reason.name : "UnknownError",
    };
    input.recordFailure?.(evidence);
  });
  return { handled: true, classification, attempted: deliveries.length, failed };
}
