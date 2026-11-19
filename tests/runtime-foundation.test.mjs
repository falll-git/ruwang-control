import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { ConfigurationError, parseRuntimeConfig } from "../src/lib/env.ts";
import { DatabaseUnavailableError, SchemaNotReadyError, toPublicError } from "../src/server/errors.ts";

const validEnvironment = {
  CONTROL_APP_ENV: "test",
  CONTROL_RELEASE: "test",
  CONTROL_DATABASE_NAME: "ruwang_control_test",
  CONTROL_DATABASE_RUNTIME_ROLE: "ruwang_control_runtime_test",
  CONTROL_DATABASE_URL: "postgresql://ruwang_control_runtime_test:secret@127.0.0.1:55432/ruwang_control_test",
  CONTROL_PUBLIC_ORIGIN: "http://127.0.0.1:4320",
  CONTROL_AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  CONTROL_ENABLE_BANK_INTEGRATION: "false",
  CONTROL_ENABLE_SJ_MONITORING: "false",
  CONTROL_ENABLE_BANK_ACCOUNTS: "false",
  CONTROL_ENABLE_GENERAL_MONITORING: "false",
};

test("runtime configuration accepts only isolated Control database and runtime role", () => {
  const result = parseRuntimeConfig(validEnvironment);
  assert.equal(result.CONTROL_DATABASE_NAME, "ruwang_control_test");
  assert.equal(result.CONTROL_ENABLE_BANK_INTEGRATION, false);
  assert.equal(result.CONTROL_DATABASE_SSL, "disable");
});

test("runtime configuration rejects a database URL that contradicts verified TLS", () => {
  assert.throws(() => parseRuntimeConfig({
    ...validEnvironment,
    CONTROL_DATABASE_SSL: "verify-full",
    CONTROL_DATABASE_URL: `${validEnvironment.CONTROL_DATABASE_URL}?sslmode=disable`,
  }), error => error instanceof ConfigurationError && error.fields.includes("CONTROL_DATABASE_URL"));
});

test("monitoring membatasi sumber per polling dan mewajibkan key saat diaktifkan", () => {
  assert.equal(parseRuntimeConfig({ ...validEnvironment, CONTROL_MONITORING_MAX_SOURCES_PER_POLL: "5" }).CONTROL_MONITORING_MAX_SOURCES_PER_POLL, 5);
  assert.throws(() => parseRuntimeConfig({ ...validEnvironment, CONTROL_MONITORING_MAX_SOURCES_PER_POLL: "6" }), ConfigurationError);
  assert.throws(() => parseRuntimeConfig({ ...validEnvironment, CONTROL_ENABLE_SJ_MONITORING: "true" }), ConfigurationError);
});

for (const [name, overrides] of [
  ["bank database", { CONTROL_DATABASE_NAME: "ruwang_arsip", CONTROL_DATABASE_URL: "postgresql://ruwang_control_runtime_test:secret@127.0.0.1:5432/ruwang_arsip" }],
  ["central SJ database", { CONTROL_DATABASE_NAME: "seputarjaminan", CONTROL_DATABASE_URL: "postgresql://ruwang_control_runtime_test:secret@127.0.0.1:5432/seputarjaminan" }],
  ["different URL database", { CONTROL_DATABASE_URL: "postgresql://ruwang_control_runtime_test:secret@127.0.0.1:55432/ruwang_control_other" }],
  ["different URL role", { CONTROL_DATABASE_URL: "postgresql://wrong_role:secret@127.0.0.1:55432/ruwang_control_test" }],
  ["enabled unfinished integration", { CONTROL_ENABLE_BANK_INTEGRATION: "true" }],
]) test(`runtime configuration rejects ${name}`, () => {
  assert.throws(() => parseRuntimeConfig({ ...validEnvironment, ...overrides }), ConfigurationError);
});

test("production configuration requires a commit SHA release", () => {
  assert.throws(() => parseRuntimeConfig({ ...validEnvironment, CONTROL_APP_ENV: "production", CONTROL_RELEASE: "development" }), ConfigurationError);
  const release = "a".repeat(40);
  assert.equal(parseRuntimeConfig({ ...validEnvironment, CONTROL_APP_ENV: "production", CONTROL_RELEASE: release, CONTROL_PUBLIC_ORIGIN: "https://control.example.test" }).CONTROL_RELEASE, release);
});

test("public errors remain stable and do not expose causes or configuration values", () => {
  const secret = "password-that-must-not-leak";
  for (const error of [
    new ConfigurationError(["CONTROL_DATABASE_URL"]),
    new SchemaNotReadyError(),
    new DatabaseUnavailableError({ cause: new Error(secret) }),
    new Error(secret),
  ]) {
    const result = toPublicError(error);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.match(result.code, /^[A-Z_]+$/);
    assert.ok(result.status >= 500);
  }
});

test("migrations create the Control schema without seed data", async () => {
  const files = (await readdir(new URL("../migrations/", import.meta.url))).filter(name => name.endsWith(".sql"));
  assert.deepEqual(files, ["0001_initial_control.sql", "0002_operator_auth.sql", "0003_bank_review_adapter.sql", "0004_sj_monitoring.sql", "0005_private_review_snapshots.sql", "0006_password_only_operator_access.sql", "0007_sj_change_requests.sql", "0008_review_authority_lock.sql", "0009_review_dispatch_ownership.sql", "0010_monitor_poll_ownership.sql", "0011_monitoring_evidence.sql", "0012_delivery_recovery.sql", "0013_sj_processing_recovery.sql", "0014_single_internal_role.sql", "0015_verified_subject_bindings.sql", "0016_retire_identity_and_public_observation.sql"]);
  const sql = (await Promise.all(files.map(file => readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8")))).join("\n");
  for (const table of ["instances", "review_snapshots", "review_commands", "service_observations", "audit_events"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS control\\.${table}`));
  }
  for (const table of ["operators", "operator_password_credentials", "operator_grants", "operator_sessions", "auth_rate_limits", "security_audit_events"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS control\\.${table}`));
  }
  for (const table of ["review_reasons", "review_dispatch_attempts", "bank_ack_nonces"]) {
    assert.match(sql, new RegExp(`CREATE TABLE control\\.${table}`));
  }
  for (const table of ["monitor_sources", "monitor_poll_state", "monitor_response_nonces"]) {
    assert.match(sql, new RegExp(`CREATE TABLE control\\.${table}`));
  }
  assert.match(sql, /CREATE TABLE control\.review_snapshot_nonces/);
  assert.match(sql, /CREATE TABLE control\.delivery_recovery_requests/);
  assert.match(sql, /ADD COLUMN provider varchar\(8\) NOT NULL DEFAULT 'BANK'/);
  assert.match(sql, /ADD COLUMN sj_recovery_binding jsonb/);
  assert.match(sql, /CREATE FUNCTION control\.lock_review_authority/);
  assert.match(sql, /SET search_path = pg_catalog/);
  assert.match(sql, /REVOKE ALL ON FUNCTION control\.lock_review_authority\(uuid, uuid\) FROM PUBLIC/);
  const historical = (await Promise.all(files.filter(file => !file.startsWith("0014_")&&!file.startsWith("0015_")).map(file => readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(historical, /\bINSERT\s+INTO\b/i);
  const transition = await readFile(new URL("../migrations/0014_single_internal_role.sql", import.meta.url), "utf8");
  assert.match(transition, /INSERT INTO control\.security_audit_events/);
  assert.doesNotMatch(transition, /INSERT INTO control\.(operators|review_snapshots|review_commands|operator_grants)\b/);
  const identity = await readFile(new URL("../migrations/0015_verified_subject_bindings.sql", import.meta.url), "utf8");
  assert.match(identity,/CREATE TRIGGER subject_binding_history/);
  assert.doesNotMatch(identity,/INSERT INTO control\.(verified_subject_bindings|operators|review_snapshots|review_commands)\b/);
  assert.doesNotMatch(sql, /ruwang_arsip|seputarjaminan(?:_production|_central)?/i);
});
