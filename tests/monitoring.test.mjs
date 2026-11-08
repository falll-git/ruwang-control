import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import test from "node:test";
import { canonicalJson, createTransportSigningMessage, payloadDigest, signTransport, verifyTransport } from "../src/domain/control-review-contract.ts";
import { displayStatus, monitoringBackoffSeconds, monitoringBaseUrl, monitoringSnapshotSchema, monitoringSummary } from "../src/domain/monitoring.ts";
import { verifyMonitoringSnapshotResponse } from "../src/domain/monitoring-transport.ts";

test('empty snapshot and unknown queue never become healthy',()=>{
  assert.equal(monitoringSummary({services:[],queues:[]}),'unknown');
  assert.equal(monitoringSummary({services:[{status:'healthy'}],queues:[{status:'unknown',depth:0}]}),'unknown');
  assert.equal(monitoringSummary({services:[{status:'unknown'}],queues:[{status:'degraded'}]}),'degraded');
  assert.equal(monitoringSummary({services:[{status:'healthy'}],queues:[{status:'healthy',depth:0}]}),'healthy');
});

test("status monitoring membedakan stale dan mempertahankan status sumber segar", () => {
  const now = new Date("2026-09-10T10:00:00.000Z");
  assert.equal(displayStatus({ status: "healthy", observedAt: new Date("2026-09-10T09:59:00.000Z"), staleAfterSeconds: 120, now }), "healthy");
  assert.equal(displayStatus({ status: "degraded", observedAt: new Date("2026-09-10T09:57:59.000Z"), staleAfterSeconds: 120, now }), "stale");
  assert.equal(displayStatus({ status: "offline", observedAt: now, staleAfterSeconds: 120, now }), "offline");
  assert.equal(displayStatus({ status: "unknown", observedAt: null, staleAfterSeconds: 120, now }), "unknown");
});

test("backoff monitoring bertambah terbatas dan tidak melampaui batas", () => {
  assert.deepEqual([1, 2, 3, 8, 20].map(value => monitoringBackoffSeconds(value, 30, 900)), [30, 60, 120, 900, 900]);
});

test("URL sumber monitoring menolak credential, path, query, dan origin HTTP non-loopback", () => {
  assert.equal(monitoringBaseUrl("http://127.0.0.1:4100", false).origin, "http://127.0.0.1:4100");
  for (const url of ["http://example.test", "https://user:pass@example.test", "https://example.test/path", "https://example.test/?secret=x"]) {
    assert.throws(() => monitoringBaseUrl(url, false), /MONITOR_SOURCE_URL_INVALID/);
  }
});

test("snapshot monitoring wajib kanonis, terikat sumber, dan bertanda tangan", () => {
  const pair = generateKeyPairSync("ed25519");
  const now = new Date("2026-09-10T10:00:00.000Z");
  const instanceId = randomUUID();
  const snapshot = monitoringSnapshotSchema.parse({ contract_version: 1, instance_id: instanceId, source_kind: "ruwang",
    observed_at: "2026-09-10T09:55:00.000Z", services: [{ key: "api", status: "healthy" }], queues: [] });
  const body = canonicalJson(snapshot);
  const timestamp = now.toISOString(); const nonce = randomUUID(); const digest = payloadDigest(snapshot);
  const signature = signTransport(createTransportSigningMessage({ method: "GET", path: "/api/v1/internal/ruwang-control/sj-monitoring/snapshot", timestamp, nonce, contentSha256: digest }), pair.privateKey);
  const message = createTransportSigningMessage({ method: "GET", path: "/api/v1/internal/ruwang-control/sj-monitoring/snapshot", timestamp, nonce, contentSha256: digest });
  assert.equal(body, canonicalJson(JSON.parse(body)));
  assert.equal(verifyTransport(message, signature, pair.publicKey), true);
  assert.equal(verifyTransport(message, signature, generateKeyPairSync("ed25519").publicKey), false);
  const response = new Response(body, { status: 200, headers: { "content-type": "application/json",
    "x-rc-ack-key-id": "bank-response-key", "x-rc-ack-timestamp": timestamp, "x-rc-ack-nonce": nonce,
    "x-rc-ack-content-sha256": digest, "x-rc-ack-signature": signature } });
  assert.equal(verifyMonitoringSnapshotResponse({ response, bodyText: body, source: { instanceId, sourceKind: "ruwang",
    responseKeyId: "bank-response-key", responsePublicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString() },
    path: "/api/v1/internal/ruwang-control/sj-monitoring/snapshot", now }).snapshot.instance_id, instanceId);
  assert.throws(() => verifyMonitoringSnapshotResponse({ response, bodyText: body.replace("healthy", "degraded"), source: { instanceId,
    sourceKind: "ruwang", responseKeyId: "bank-response-key", responsePublicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString() },
    path: "/api/v1/internal/ruwang-control/sj-monitoring/snapshot", now }), /MONITOR_SOURCE_(?:RESPONSE|SIGNATURE)_INVALID/);
});
