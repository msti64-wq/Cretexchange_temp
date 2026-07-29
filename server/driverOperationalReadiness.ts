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

  let termsAccepted = false;
  let termsLedgerAvailable = true;
  const [profile, termsState] = await Promise.all([
    storage.getDriver(userId),
    getTermsStateForUser({ id: user.id, role: "driver" }).catch((error) => {
      if ((error as { code?: string }).code === "TERMS_LEDGER_UNAVAILABLE") return null;
      throw error;
    }),
  ]);
  if (termsState === null) termsLedgerAvailable = false;
  else termsAccepted = !termsState.requiresAcceptance;
  const activeMaterial = profile?.activeMaterialSlug
    ? await storage.getMaterialBySlug(profile.activeMaterialSlug)
    : null;

  return resolveDriverOperationalReadiness({
    user,
    profile,
    termsAccepted,
    termsLedgerAvailable,
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
    const ledgerUnavailable = readiness.reasons.some((reason) => reason.code === "terms_ledger_unavailable");
    res.status(ledgerUnavailable ? 503 : 409).json({
      ...buildDriverOperationalReadinessDenial(readiness),
      ...(ledgerUnavailable ? { code: "TERMS_LEDGER_UNAVAILABLE", message: "Terms verification is temporarily unavailable" } : {}),
    });
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
