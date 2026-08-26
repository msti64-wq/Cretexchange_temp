const IMMEDIATE_PUBLIC_ROUTES = new Set([
  "/login",
  "/register",
  "/register/driver",
  "/register/owner",
  "/reset-password",
  "/privacy-policy",
  "/terms-and-conditions",
  "/t-and-c",
]);

export function isImmediatePublicRoute(path: string) {
  return IMMEDIATE_PUBLIC_ROUTES.has(path);
}
