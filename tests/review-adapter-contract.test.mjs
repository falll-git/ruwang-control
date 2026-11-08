import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  canonicalJson,
  createTransportSigningMessage,
  payloadDigest,
  reviewAcknowledgmentSchema,
  reviewCommandSchema,
  signTransport,
  verifyTransport,
} from "../src/domain/control-review-contract.ts";

const ids = Object.freeze({
  command: "10000000-0000-4000-8000-000000000001",
  instance: "10000000-0000-4000-8000-000000000002",
  operator: "10000000-0000-4000-8000-000000000003",
  resource: "10000000-0000-4000-8000-000000000004",
  acknowledgment: "10000000-0000-4000-8000-000000000005",
});

function command(overrides = {}) {
  return {
    contract_version: 1,
    command_id: ids.command,
    instance_id: ids.instance,
    actor_subject: `ruwang-control:${ids.operator}`,
    audience: "ruwang-bank:test",
    resource: { kind: "publication", id: ids.resource },
    decision: "approve",
    contributor_subjects: ["ruwang-bank:10000000-0000-4000-8000-000000000006"],
    expected_version: 0,
    expected_checksum: "a".repeat(64),
    issued_at: "2026-09-10T00:00:00.000Z",
    expires_at: "2026-09-10T00:01:00.000Z",
    ...overrides,
  };
}

test("command V1 menerima versi nol dan mengikat revision note pada decision", () => {
  assert.equal(reviewCommandSchema.parse(command()).expected_version, 0);
  assert.equal(reviewCommandSchema.safeParse(command({ reason: "tidak boleh" })).success, false);
  assert.equal(reviewCommandSchema.safeParse(command({ decision: "request_revision" })).success, false);
  assert.equal(reviewCommandSchema.safeParse(command({ decision: "request_revision", reason: "Lengkapi foto." })).success, true);
});

test("command lifecycle mewajibkan catatan dan membatasi reject pada change request", () => {
  const lifecycle = command({
    resource: { kind: "change_request", id: ids.resource },
    expected_version: 1,
  });
  assert.equal(reviewCommandSchema.safeParse(lifecycle).success, false);
  assert.equal(reviewCommandSchema.safeParse({ ...lifecycle, reason: "Dampak sudah diperiksa." }).success, true);
  assert.equal(reviewCommandSchema.safeParse({ ...lifecycle, decision: "reject", reason: "Permintaan belum aman dijalankan." }).success, true);
  assert.equal(reviewCommandSchema.safeParse({ ...command(), decision: "reject", reason: "Tidak sah." }).success, false);
});

test("canonical JSON dan signature Ed25519 stabil serta menolak payload berubah", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const payload = command();
  const digest = payloadDigest(payload);
  const message = createTransportSigningMessage({ method: "post", path: "/api/v1/internal/ruwang-control/sj-review/commands", timestamp: payload.issued_at, nonce: ids.acknowledgment, contentSha256: digest });
  const signature = signTransport(message, privateKey);
  assert.equal(verifyTransport(message, signature, publicKey), true);
  assert.equal(verifyTransport(`${message}x`, signature, publicKey), false);
  assert.equal(canonicalJson({ z: 1, a: 2 }), '{"a":2,"z":1}');
});

test("acknowledgment V1 mengikat command, scope, hasil dan observed state", () => {
  const parsed = reviewAcknowledgmentSchema.parse({
    contract_version: 1,
    acknowledgment_id: ids.acknowledgment,
    command_id: ids.command,
    command_digest: "b".repeat(64),
    instance_id: ids.instance,
    resource: { kind: "publication", id: ids.resource },
    status: "APPLIED",
    result_code: "DECISION_APPLIED",
    observed_version: 1,
    observed_checksum: "c".repeat(64),
    processed_at: "2026-09-10T00:00:01.000Z",
  });
  assert.equal(parsed.status, "APPLIED");
});

test("source adapter tidak memuat token Admin atau credential database bank", async () => {
  const source = await readFile(new URL("../src/server/review-adapter.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /ADMIN_TOKEN|DATABASE_BANK|Authorization:\s*Bearer/i);
  assert.match(source, /redirect:\s*"error"/);
  assert.match(source, /bank_ack_nonces/);
  assert.match(source, /state = 'UNKNOWN'/);
});
