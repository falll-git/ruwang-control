import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword, passwordPolicyError, sha256, verifyPassword,
} from "../src/server/auth/crypto.ts";
import { authorize } from "../src/domain/authorization.ts";

test("password hashing is salted and rejects invalid credentials", async () => {
  const password = "Control-Operator-Password-2026!";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
  assert.equal(await verifyPassword(password, null), false);
  assert.match(passwordPolicyError("short") ?? "", /minimal 14/);
});

test("one internal role covers every supported action on registered scopes only", () => {
  const base = { id: "operator", issuer: "ruwang-control", active: true, sessionVerified: true };
  const operator = { ...base, grants: [{ instanceId: "bank-a", role: "internal_operator", active: true }] };
  for (const action of ["review.approve", "bank_account.manage", "operator.manage", "session.revoke", "delivery.retry", "audit.read"]) {
    assert.equal(authorize(operator, action, "bank-a").allowed, true);
    assert.equal(authorize(operator, action, "unknown-bank").allowed, false);
  }
  for (const role of ["reviewer", "observer", "bank_account_manager", "control_access_manager", "delivery_operator"]) {
    assert.equal(authorize({ ...base, grants: [{ instanceId: "bank-a", role, active: true }] }, "review.read", "bank-a").allowed, false);
  }
  assert.equal(sha256("same"), sha256("same"));
});
