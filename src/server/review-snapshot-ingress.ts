import { readFile } from "node:fs/promises";
import type { NextRequest } from "next/server";
import type { QueryResultRow } from "pg";
import {
  canonicalJson,
  createTransportSigningMessage,
  payloadDigest,
  signTransport,
  transportHeaderNames,
  verifyTransport,
} from "@/src/domain/control-review-contract";
import { reviewSnapshotEnvelopeSchema, type ReviewSnapshotEnvelope } from "@/src/domain/review-snapshot";
import { getRuntimeConfig } from "@/src/lib/env";
import { withTransaction } from "@/src/server/database";
import { ConflictError, IntegrationUnavailableError, RequestValidationError } from "@/src/server/errors";
import { lockReviewAggregate } from "@/src/server/review-guards";

export const reviewSnapshotPath = "/api/internal/sj-review/snapshots";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type InstanceRow = QueryResultRow & {
  id: string;
  review_authority: "local" | "central";
  control_signing_key_id: string | null;
  bank_ack_key_id: string | null;
  bank_ack_public_key: string | null;
};

async function readControlPrivateKey(): Promise<{ keyId: string; privateKey: string }> {
  const config = getRuntimeConfig();
  if (!config.CONTROL_ENABLE_BANK_INTEGRATION || !config.CONTROL_BANK_SIGNING_KEY_ID || !config.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE) {
    throw new IntegrationUnavailableError("BANK_INTEGRATION_DISABLED");
  }
  const privateKey = await readFile(config.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE, "utf8");
  if (privateKey.length < 80 || privateKey.length > 16_384 || !privateKey.includes("PRIVATE KEY")) {
    throw new IntegrationUnavailableError("CONTROL_SIGNING_KEY_INVALID");
  }
  return { keyId: config.CONTROL_BANK_SIGNING_KEY_ID, privateKey };
}

function header(request: NextRequest, name: string): string {
  return request.headers.get(name)?.trim() ?? "";
}

async function parseAndVerify(request: NextRequest, now: Date): Promise<{
  snapshot: ReviewSnapshotEnvelope;
  digest: string;
  keyId: string;
  nonce: string;
  instance: InstanceRow;
}> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 65_536) throw new RequestValidationError("SNAPSHOT_TOO_LARGE");
  const bodyText = await request.text();
  if (Buffer.byteLength(bodyText, "utf8") > 65_536) throw new RequestValidationError("SNAPSHOT_TOO_LARGE");
  let parsed: unknown;
  try { parsed = JSON.parse(bodyText); } catch { throw new RequestValidationError("SNAPSHOT_INVALID_JSON"); }
  const result = reviewSnapshotEnvelopeSchema.safeParse(parsed);
  if (!result.success || canonicalJson(result.data) !== bodyText) throw new RequestValidationError("SNAPSHOT_INVALID");
  const digest = payloadDigest(result.data);
  const instanceId = header(request, transportHeaderNames.instanceId);
  const keyId = header(request, transportHeaderNames.acknowledgmentKeyId);
  const timestamp = header(request, transportHeaderNames.acknowledgmentTimestamp);
  const nonce = header(request, transportHeaderNames.acknowledgmentNonce);
  const contentSha256 = header(request, transportHeaderNames.acknowledgmentContentSha256);
  const signature = header(request, transportHeaderNames.acknowledgmentSignature);
  if (instanceId !== result.data.instance_id || !uuidPattern.test(nonce) || contentSha256 !== digest) {
    throw new IntegrationUnavailableError("SNAPSHOT_SIGNATURE_INVALID");
  }
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(now.getTime() - timestampMs) > 300_000) {
    throw new IntegrationUnavailableError("SNAPSHOT_EXPIRED");
  }
  const instanceRows = await withTransaction(client => client.query<InstanceRow>(`
    SELECT id::text, review_authority, control_signing_key_id, bank_ack_key_id, bank_ack_public_key
    FROM control.instances WHERE id = $1 AND enabled = true
  `, [result.data.instance_id]));
  const instance = instanceRows.rows[0];
  if (!instance || instance.review_authority !== "central" || !instance.bank_ack_key_id || !instance.bank_ack_public_key) {
    throw new IntegrationUnavailableError("CENTRAL_REVIEW_DISABLED");
  }
  if (keyId !== instance.bank_ack_key_id || !verifyTransport(createTransportSigningMessage({
    method: "POST", path: reviewSnapshotPath, timestamp, nonce, contentSha256: digest,
  }), signature, instance.bank_ack_public_key)) {
    throw new IntegrationUnavailableError("SNAPSHOT_SIGNATURE_INVALID");
  }
  return { snapshot: result.data, digest, keyId, nonce, instance };
}

export async function acceptReviewSnapshot(request: NextRequest, now = new Date()) {
  const verified = await parseAndVerify(request, now);
  const signer = await readControlPrivateKey();
  if (verified.instance.control_signing_key_id !== signer.keyId) throw new IntegrationUnavailableError("CONTROL_KEY_ID_MISMATCH");
  await withTransaction(async client => {
    // Keep authority/key stable through commit, not only during signature verification.
    await client.query("SELECT control.lock_review_authority($1::uuid)", [verified.snapshot.instance_id]);
    const current = await client.query<InstanceRow>(`SELECT id::text, review_authority, control_signing_key_id, bank_ack_key_id, bank_ack_public_key
      FROM control.instances WHERE id = $1 AND enabled = true`, [verified.snapshot.instance_id]);
    const instance = current.rows[0];
    if (!instance || instance.review_authority !== "central" || instance.bank_ack_key_id !== verified.keyId ||
        instance.bank_ack_public_key !== verified.instance.bank_ack_public_key || instance.control_signing_key_id !== signer.keyId) {
      throw new IntegrationUnavailableError("CENTRAL_REVIEW_DISABLED");
    }
    await client.query("DELETE FROM control.review_snapshot_nonces WHERE expires_at <= now()");
    try {
      await client.query(`INSERT INTO control.review_snapshot_nonces (instance_id, key_id, nonce, expires_at)
        VALUES ($1,$2,$3,now() + interval '10 minutes')`, [verified.snapshot.instance_id, verified.keyId, verified.nonce]);
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") throw new ConflictError("SNAPSHOT_REPLAYED");
      throw error;
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [verified.snapshot.snapshot_id]);
    await lockReviewAggregate(client, verified.snapshot.instance_id, verified.snapshot.resource.kind, verified.snapshot.resource.id);
    const existing = await client.query<{ envelope_digest: string | null }>(
      "SELECT envelope_digest FROM control.review_snapshots WHERE id = $1", [verified.snapshot.snapshot_id],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].envelope_digest !== verified.digest) throw new ConflictError("SNAPSHOT_ID_REUSED");
      return;
    }
    const latest = await client.query<{ source_version: number }>(`SELECT source_version FROM control.review_snapshots
      WHERE instance_id = $1 AND resource_kind = $2 AND source_id = $3 ORDER BY source_version DESC LIMIT 1`,
    [verified.snapshot.instance_id, verified.snapshot.resource.kind, verified.snapshot.resource.id]);
    if (latest.rows[0] && latest.rows[0].source_version >= verified.snapshot.source_version) throw new ConflictError("SNAPSHOT_STALE_OR_DUPLICATE_VERSION");
    await client.query(`UPDATE control.review_snapshots SET state = 'SUPERSEDED'
      WHERE instance_id = $1 AND resource_kind = $2 AND source_id = $3 AND source_version < $4 AND state = 'IN_REVIEW'`,
    [verified.snapshot.instance_id, verified.snapshot.resource.kind, verified.snapshot.resource.id, verified.snapshot.source_version]);
    await client.query(`INSERT INTO control.review_snapshots
      (id, instance_id, resource_kind, source_id, source_version, payload_checksum, state,
       contributor_subjects, submitted_at, envelope_json, envelope_digest)
      VALUES ($1,$2,$3,$4,$5,$6,'IN_REVIEW',$7::jsonb,$8,$9::jsonb,$10)`, [
      verified.snapshot.snapshot_id, verified.snapshot.instance_id, verified.snapshot.resource.kind,
      verified.snapshot.resource.id, verified.snapshot.source_version, verified.snapshot.payload_checksum,
      JSON.stringify(verified.snapshot.contributor_subjects), verified.snapshot.submitted_at,
      canonicalJson(verified.snapshot), verified.digest,
    ]);
  });
  const body = canonicalJson({ contract_version: 1, snapshot_id: verified.snapshot.snapshot_id,
    instance_id: verified.snapshot.instance_id, status: "ACCEPTED", received_at: now.toISOString() });
  const digest = payloadDigest(JSON.parse(body));
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const signature = signTransport(createTransportSigningMessage({ method: "POST", path: reviewSnapshotPath,
    timestamp, nonce, contentSha256: digest }), signer.privateKey);
  return { body, headers: {
    [transportHeaderNames.keyId]: signer.keyId,
    [transportHeaderNames.timestamp]: timestamp,
    [transportHeaderNames.nonce]: nonce,
    [transportHeaderNames.contentSha256]: digest,
    [transportHeaderNames.signature]: signature,
  } };
}
