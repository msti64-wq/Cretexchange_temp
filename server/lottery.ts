import type { IStorage } from "./storage";

export const LOTTERY_FEATURE_FLAG_KEY = "lottery_enabled";

function parseBooleanEnv(value?: string | null): boolean | undefined {
  if (value == null || value.trim() === "") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

export async function resolveLotteryEnabled(storage: Pick<IStorage, "getFeatureFlag">): Promise<{
  enabled: boolean;
  source: "env" | "flag" | "default";
}> {
  const envOverride = parseBooleanEnv(process.env.LOTTERY_ENABLED ?? process.env.ENABLE_LOTTERY);
  if (envOverride !== undefined) {
    return { enabled: envOverride, source: "env" };
  }

  const flag = await storage.getFeatureFlag(LOTTERY_FEATURE_FLAG_KEY);
  if (flag) {
    return { enabled: flag.enabled ?? true, source: "flag" };
  }

  return { enabled: true, source: "default" };
}

