import { resolveDriverOperationalReadiness, type DriverOperationalReadinessReason } from "@shared/driverOperationalReadiness";
import { getTermsStateForUser } from "./terms";
import { storage } from "./storage";

export type DriverOperationalReadiness = ReturnType<typeof resolveDriverOperationalReadiness>;

export interface DriverOperationalReadinessDenial {
  message: string;
  code: "DRIVER_OPERATIONAL_READINESS_REQUIRED";
  readiness: {
    ready: false;
    reasons: DriverOperationalReadinessReason[];
  };
}

export async function resolveStoredDriverOperationalReadiness(userId: string): Promise<DriverOperationalReadiness> {
  const user = await storage.getUser(userId);
  if (!user || user.role !== "driver") {
    return resolveDriverOperationalReadiness({ user: user || undefined });
  }

  const [profile, englishTermsState, spanishTermsState] = await Promise.all([
    storage.getDriver(userId),
    getTermsStateForUser({ id: user.id, role: "driver" }),
    getTermsStateForUser({ id: user.id, role: "driver" }, undefined, "es"),
  ]);
  const activeMaterial = profile?.activeMaterialSlug
    ? await storage.getMaterialBySlug(profile.activeMaterialSlug)
    : null;

  return resolveDriverOperationalReadiness({
    user,
    profile,
    // The ledger records the legal-document language. Operational eligibility
    // requires a complete current Driver ledger, not a specific UI locale.
    termsAccepted: !englishTermsState.requiresAcceptance || !spanishTermsState.requiresAcceptance,
    activeMaterial,
  });
}

export async function requireDriverRole(req: any, res: any) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized", code: "UNAUTHENTICATED" });
    return null;
  }

  const user = await storage.getUser(userId);
  if (!user || user.role !== "driver") {
    res.status(403).json({ message: "Driver access required", code: "DRIVER_ROLE_REQUIRED" });
    return null;
  }

  return user;
}

export function buildDriverOperationalReadinessDenial(readiness: DriverOperationalReadiness): DriverOperationalReadinessDenial {
  return {
    message: "Complete your Driver account readiness before submitting operational activity.",
    code: "DRIVER_OPERATIONAL_READINESS_REQUIRED",
    readiness: {
      ready: false,
      reasons: readiness.reasons,
    },
  };
}

export async function requireDriverOperationalReadiness(req: any, res: any) {
  const user = await requireDriverRole(req, res);
  if (!user) return null;

  const readiness = await resolveStoredDriverOperationalReadiness(user.id);
  if (!readiness.ready) {
    res.status(409).json(buildDriverOperationalReadinessDenial(readiness));
    return null;
  }

  return readiness;
}

export async function driverRoleMiddleware(req: any, res: any, next: () => void) {
  if (await requireDriverRole(req, res)) next();
}

export async function driverOperationalReadinessMiddleware(req: any, res: any, next: () => void) {
  if (await requireDriverOperationalReadiness(req, res)) next();
}
