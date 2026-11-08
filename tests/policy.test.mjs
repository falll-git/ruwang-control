import test from "node:test";
import assert from "node:assert/strict";
import { authorize } from "../src/domain/authorization.ts";
import { validateDecision } from "../src/domain/review.ts";
import { createAuditMetadata } from "../src/domain/audit.ts";

const principal = { id: "operator-1", issuer: "ruwang-control", active: true, sessionVerified: true,
  grants: [{ instanceId: "bank-a", role: "internal_operator", active: true }] };
const snapshot = { id: "review-1", instanceId: "bank-a", kind: "publication", state: "IN_REVIEW", version: 2,
  checksum: "a".repeat(64), contributors: ["bank-a:user-1"] };
const input = { instanceId: "bank-a", reviewId: "review-1", expectedVersion: 2, expectedChecksum: snapshot.checksum,
  decision: "approve", reason: "" };
const context = { connected: true, authority: "central", auditWritable: true };

test('internal access includes recovery but cannot bypass target or active session checks',()=>{
  assert.equal(authorize(principal,'delivery.retry','bank-a').allowed,true);
  assert.equal(authorize(principal,'delivery.retry','bank-b').allowed,false);
  assert.equal(authorize({...principal,active:false},'delivery.retry','bank-a').allowed,false);
  assert.equal(authorize({...principal,grants:[{...principal.grants[0],active:false}]},'delivery.retry','bank-a').allowed,false);
});

test("authenticated reviewer may request a command; approval is not marked applied", () => {
  assert.deepEqual(validateDecision(principal, snapshot, input, context), { allowed: true, next: "COMMAND_PENDING" });
});
test("monitoring requires a server-projected registered scope", () => {
  assert.equal(authorize(principal, "monitoring.read", "bank-a").allowed, true);
  assert.equal(authorize(principal, "monitoring.read", "bank-b").allowed, false);
  assert.equal(authorize({ ...principal, grants: [{ instanceId: "bank-a", role: "observer", active: true }] }, "monitoring.read", "bank-a").allowed, false);
});
for (const [name, actor, action, scope] of [
  ["anonymous", null, "review.read", "bank-a"],
  ["inactive", { ...principal, active: false }, "review.read", "bank-a"],
  ["unverified session", { ...principal, sessionVerified: false }, "review.read", "bank-a"],
  ["bank login is not control login", { ...principal, issuer: "bank-a" }, "review.read", "bank-a"],
  ["cross bank", principal, "review.read", "bank-b"],
  ["wildcard scope", principal, "review.read", "*"],
  ["unknown action", principal, "user.delete", "bank-a"],
  ["observer approval", { ...principal, grants: [{ instanceId: "bank-a", role: "observer", active: true }] }, "review.approve", "bank-a"],
  ["access manager approval", { ...principal, grants: [{ instanceId: "bank-a", role: "control_access_manager", active: true }] }, "review.approve", "bank-a"],
  ["bank account manager approval", { ...principal, grants: [{ instanceId: "bank-a", role: "bank_account_manager", active: true }] }, "review.approve", "bank-a"],
  ["revoked grant", { ...principal, grants: [{ instanceId: "bank-a", role: "reviewer", active: false }] }, "review.read", "bank-a"],
  ["unknown role", { ...principal, grants: [{ instanceId: "bank-a", role: "toString", active: true }] }, "review.read", "bank-a"],
]) test(`deny ${name}`, () => assert.equal(authorize(actor, action, scope).allowed, false));

for (const [name, record, command, runtime, reason] of [
  ["different target", snapshot, { ...input, reviewId: "review-2" }, context, "TARGET_MISMATCH"],
  ["target from another bank", { ...snapshot, instanceId: "bank-b" }, input, context, "TARGET_MISMATCH"],
  ["old version", snapshot, { ...input, expectedVersion: 1 }, context, "STALE_SNAPSHOT"],
  ["different snapshot", snapshot, { ...input, expectedChecksum: "b".repeat(64) }, context, "STALE_SNAPSHOT"],
  ["bad snapshot", { ...snapshot, checksum: "" }, input, context, "INVALID_SNAPSHOT"],
  ["already approved", { ...snapshot, state: "APPROVED" }, input, context, "NOT_IN_REVIEW"],
  ["self approval", { ...snapshot, contributors: ["ruwang-control:operator-1"] }, input, context, "SELF_REVIEW"],
  ["local authority", snapshot, input, { ...context, authority: "local" }, "CENTRAL_REVIEW_DISABLED"],
  ["offline source", snapshot, input, { ...context, connected: false }, "SOURCE_UNAVAILABLE"],
  ["audit failure", snapshot, input, { ...context, auditWritable: false }, "AUDIT_UNAVAILABLE"],
  ["empty revision", snapshot, { ...input, decision: "request_revision", reason: "  " }, context, "REASON_REQUIRED"],
  ["unbounded note", snapshot, { ...input, reason: "x".repeat(2001) }, context, "REASON_TOO_LONG"],
  ["unknown decision", snapshot, { ...input, decision: "delete" }, context, "INVALID_DECISION"],
]) test(`reject ${name}`, () => assert.deepEqual(validateDecision(principal, record, command, runtime), { allowed: false, reason }));

test("revision requires a note and keeps operation pending", () => {
  assert.deepEqual(validateDecision(principal, snapshot, { ...input, decision: "request_revision", reason: "Lengkapi foto." }, context), { allowed: true, next: "COMMAND_PENDING" });
});

test("lifecycle requires an auditable note for approve, revision and reject", () => {
  const lifecycle = { ...snapshot, kind: "change_request" };
  for (const decision of ["approve", "request_revision", "reject"]) {
    assert.deepEqual(validateDecision(principal, lifecycle, { ...input, decision, reason: "" }, context), { allowed: false, reason: "REASON_REQUIRED" });
    assert.deepEqual(validateDecision(principal, lifecycle, { ...input, decision, reason: "Dampak sudah diperiksa." }, context), { allowed: true, next: "COMMAND_PENDING" });
  }
  assert.deepEqual(validateDecision(principal, snapshot, { ...input, decision: "reject", reason: "Tidak sah." }, context), { allowed: false, reason: "INVALID_DECISION" });
});
const event = { eventId: "evt-1", requestId: "req-1", actorId: "op-1", instanceId: "bank-a", resourceId: "pub-1",
  action: "review.decision_requested", reasonCode: "NONE", outcome: "requested", version: 2, occurredAt: "2026-09-10T00:00:00.000Z" };
test("audit projects only approved metadata", () => {
  const result = createAuditMetadata({ ...event, password: "do-not-keep", request: { secret: "do-not-keep" }, reason: "private note" });
  assert.deepEqual(result, { schemaVersion: 1, ...event });
  assert.ok(Object.isFrozen(result));
});
test("audit rejects injected identity, impossible outcome and invalid timestamp", () => {
  assert.throws(() => createAuditMetadata({ ...event, actorId: "operator\nforged" }));
  assert.throws(() => createAuditMetadata({ ...event, outcome: "applied" }));
  assert.throws(() => createAuditMetadata({ ...event, occurredAt: "2026-02-30T00:00:00.000Z" }));
});
