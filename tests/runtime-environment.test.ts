import assert from "node:assert/strict";
import test from "node:test";
import { isFinancialExecutionEnabled, resolveRuntimeEnvironment } from "../server/runtimeEnvironment";

test("Railway staging identity takes precedence over NODE_ENV production", () => {
  assert.equal(resolveRuntimeEnvironment({ RAILWAY_ENVIRONMENT_NAME: "staging", NODE_ENV: "production" }), "staging");
  assert.equal(resolveRuntimeEnvironment({ APP_ENV: "staging", NODE_ENV: "production" }), "staging");
  assert.equal(resolveRuntimeEnvironment({ SYNCHRONIZATION_TARGET: "staging", NODE_ENV: "production" }), "staging");
});

test("financial execution is fail-closed unless global and a specific rail are enabled", () => {
  assert.equal(isFinancialExecutionEnabled({ FINANCIAL_EXECUTION_ENABLED: "true" }), false);
  assert.equal(isFinancialExecutionEnabled({ FINANCIAL_EXECUTION_ENABLED: "true", FACILITY_COLLECTION_EXECUTION_ENABLED: "true" }), true);
  assert.equal(isFinancialExecutionEnabled({ FINANCIAL_EXECUTION_ENABLED: "false", DRIVER_SETTLEMENT_EXECUTION_ENABLED: "true" }), false);
});
