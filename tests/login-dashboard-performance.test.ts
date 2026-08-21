import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isImmediatePublicRoute } from "../client/src/lib/authRoutePolicy";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("account-entry routes render without an authenticated bootstrap", () => {
  for (const path of ["/login", "/register", "/register/driver", "/register/owner", "/reset-password", "/privacy-policy"]) {
    assert.equal(isImmediatePublicRoute(path), true, path);
  }
  for (const path of ["/", "/dashboard", "/locations", "/admin/photo-review", "/intelligence"]) {
    assert.equal(isImmediatePublicRoute(path), false, path);
  }
});

test("successful login routes before its nonblocking role-profile refresh", async () => {
  const login = await source("client/src/pages/auth/login.tsx");
  assert.match(login, /setQueryData\(\["\/api\/auth\/user"\], data\.user\)/);
  assert.match(login, /refetchType: "none"/);
  assert.doesNotMatch(login, /await queryClient\.invalidateQueries/);
  assert.match(login, /setLocation\('\/'\)/);
});

test("auth bootstrap is bounded and cache startup has no destructive no-op cycle", async () => {
  const [app, auth, queryClient] = await Promise.all([
    source("client/src/App.tsx"),
    source("client/src/hooks/useAuth.ts"),
    source("client/src/lib/queryClient.ts"),
  ]);
  assert.match(app, /useAuth\(\{ enabled: !immediatePublicRoute \}\)/);
  assert.match(app, /role="status" aria-live="polite"/);
  assert.match(app, /motion-reduce:animate-none/);
  assert.match(auth, /enabled,/);
  assert.doesNotMatch(queryClient, /Clear React Query cache once on load/);
  assert.doesNotMatch(queryClient, /queryClient\.removeQueries\(\)/);
});

test("Production shell has no unconditional Replit banner or remote font waterfall", async () => {
  const [html, css, main, vite] = await Promise.all([
    source("client/index.html"),
    source("client/src/index.css"),
    source("client/src/main.tsx"),
    source("vite.config.ts"),
  ]);
  assert.doesNotMatch(html, /replit-dev-banner/);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  assert.doesNotMatch(css, /@import\s+url\([^)]*fonts\.googleapis/);
  assert.match(main, /import App from "\.\/App"/);
  assert.doesNotMatch(main, /import\("\.\/App"\)/);
  assert.match(vite, /return "i18n"/);
  assert.match(vite, /return "react-vendor"/);
});

test("role bootstrap reuses authenticated middleware state and preserves Driver-only first-login work", async () => {
  const [routes, tokenAuth, readiness] = await Promise.all([
    source("server/routes.ts"),
    source("server/tokenAuth.ts"),
    source("server/driverOperationalReadiness.ts"),
  ]);
  const authUserRoute = routes.slice(routes.indexOf("app.get('/api/auth/user'"), routes.indexOf("// Driver registration"));
  assert.match(authUserRoute, /req\.user\?\.role \? req\.user : await storage\.getUser\(userId\)/);
  assert.match(tokenAuth, /if \(user\.role === "driver"\) await storage\.recordDriverFirstLogin/);
  const requireDriver = readiness.slice(readiness.indexOf("export async function requireDriverRole"), readiness.indexOf("export function buildDriverOperationalReadinessDenial"));
  assert.match(requireDriver, /req\.user\.role \? req\.user : await storage\.getUser\(req\.user\.id\)/);
});

test("Admin critical reads are parallel and secondary queries wait for the primary response", async () => {
  const [routes, dashboard] = await Promise.all([
    source("server/routes.ts"),
    source("client/src/pages/admin/dashboard.tsx"),
  ]);
  const adminRoute = routes.slice(routes.indexOf("app.get('/api/admin/dashboard'"), routes.indexOf("app.get('/api/admin/system-settings'"));
  assert.match(adminRoute, /Promise\.all\(\[/);
  for (const call of ["getSystemStats(7)", "getSystemStats(30)", "getPaymentsAwaitingDriverStripe()", "buildOwnerBillingReceivablesOverview(storage)"]) {
    assert.ok(adminRoute.includes(call), call);
  }
  assert.ok((dashboard.match(/enabled: !isLoading/g) || []).length >= 9);
});
