import http from "node:http";
import https from "node:https";

type RequestInput = string | URL | { hostname?: string; host?: string; href?: string };

function describeHost(input: RequestInput) {
  if (typeof input === "string") {
    try { return new URL(input).hostname; } catch { return input; }
  }
  if (input instanceof URL) return input.hostname;
  return input.hostname || input.host || input.href || "unknown-host";
}

function isLocalhost(host: string) {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "").split(":")[0];
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function blockedRequest(input: RequestInput): never {
  const host = describeHost(input);
  throw new Error(`Deterministic test network guard blocked outbound request to ${host}`);
}

export function installDeterministicNetworkGuard() {
  const originalHttpRequest = http.request;
  const originalHttpsRequest = https.request;
  const originalFetch = globalThis.fetch;

  (http as any).request = (input: RequestInput, ...args: unknown[]) => (
    isLocalhost(describeHost(input)) ? (originalHttpRequest as any)(input, ...args) : blockedRequest(input)
  );
  (https as any).request = (input: RequestInput, ...args: unknown[]) => (
    isLocalhost(describeHost(input)) ? (originalHttpsRequest as any)(input, ...args) : blockedRequest(input)
  );
  globalThis.fetch = (input: RequestInfo | URL) => Promise.reject(
    new Error(`Deterministic test network guard blocked outbound fetch to ${describeHost(input as URL)}`),
  );

  return () => {
    (http as any).request = originalHttpRequest;
    (https as any).request = originalHttpsRequest;
    globalThis.fetch = originalFetch;
  };
}
