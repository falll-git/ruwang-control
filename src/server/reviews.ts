import { readFile } from "node:fs/promises";
import type { QueryResultRow } from "pg";
import { authorize, type Principal } from "@/src/domain/authorization";
import { reviewSnapshotEnvelopeSchema, type ReviewDetail, type ReviewSnapshotEnvelope } from "@/src/domain/review-snapshot";
import { createTransportSigningMessage, payloadDigest, sha256Hex, signTransport, transportHeaderNames, verifyTransport } from "@/src/domain/control-review-contract";
import { reviewActionEligibility, type ReviewAction } from "@/src/domain/review-read";
import { reviewDetailReadSchema } from "@/src/domain/review-read-contract";
import type { ReviewSnapshot } from "@/src/domain/review";
import { readReviewMediaResponse } from "@/src/domain/review-media-response";
import { getRuntimeConfig } from "@/src/lib/env";
import { query, withTransaction } from "@/src/server/database";
import { reviewResultAction } from "@/src/server/review-adapter";
import { AuthorizationError, IntegrationUnavailableError, RequestValidationError } from "@/src/server/errors";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReviewCommandState = "PENDING" | "DISPATCHING" | "APPLIED" | "REJECTED" | "UNKNOWN";
export type ReviewListItem = {
  id: string; instanceId: string; instanceName: string; kind: ReviewSnapshotEnvelope["resource"]["kind"];
  title: string; sourceVersion: number; state: string; submittedAt: string; authority: "local" | "central";
  commandState: ReviewCommandState | null;
  commandDecision: "approve" | "request_revision" | "reject" | null;
};
export type ReviewDetailView = ReviewListItem & {
  sourceId: string; checksum: string; detail: ReviewDetail; commandId: string | null;
  commandDecision: "approve" | "request_revision" | "reject" | null; commandResultCode: string | null;
  actions: ReviewAction[];
  resultCheck: { allowed: boolean; reason: string | null } | null;
  decision: { action: "approve" | "request_revision" | "reject"; note: string | null; recordedAt: string; applicationState: ReviewCommandState; resultCode: string | null } | null;
  versions: { submitted: number; latestReceived: { id: string; version: number }; bankCurrent: null; bankCurrentAvailability: "NOT_AVAILABLE" };
};
export type ReviewMedia = { body: Buffer; mime: string };

export type ReviewRow = QueryResultRow & {
  id: string; instance_id: string; instance_name: string; resource_kind: ReviewListItem["kind"];
  source_id: string; source_version: number; payload_checksum: string; state: string; submitted_at: Date;
  review_authority: "local" | "central"; envelope_json: unknown; command_id: string | null;
  command_state: ReviewCommandState | null; command_decision: "approve" | "request_revision" | "reject" | null;
  command_result_code: string | null;
  envelope_digest: string; contributor_subjects: string[]; instance_enabled: boolean;
  adapter_configured: boolean; configured_key_id: string | null;
  latest_id: string; latest_version: number; command_note: string | null; command_created_at: Date | null;
  sort_time: string;
};

export function reviewInstanceIds(principal: Principal): string[] {
  return [...new Set(principal.grants.filter(grant => grant.active && authorize(principal, "review.read", grant.instanceId).allowed).map(grant => grant.instanceId))];
}

function title(detail: ReviewDetail): string {
  if (detail.kind === "profile") return detail.public_name;
  if (detail.kind === "contact") return detail.label;
  if (detail.kind === "change_request") return detail.target_label;
  return detail.title;
}

export function parseReviewEnvelope(row: ReviewRow): ReviewSnapshotEnvelope {
  const result = reviewSnapshotEnvelopeSchema.safeParse(row.envelope_json);
  if (!result.success || result.data.snapshot_id !== row.id || result.data.instance_id !== row.instance_id ||
      result.data.resource.kind !== row.resource_kind || result.data.resource.id !== row.source_id || result.data.source_version !== row.source_version ||
      payloadDigest(result.data) !== row.envelope_digest ||
      result.data.payload_checksum !== row.payload_checksum) throw new RequestValidationError("SNAPSHOT_STORED_INVALID");
  return result.data;
}

export function projectReview(row: ReviewRow, envelope: ReviewSnapshotEnvelope): ReviewListItem {
  return { id: row.id, instanceId: row.instance_id, instanceName: row.instance_name, kind: row.resource_kind,
    title: title(envelope.detail), sourceVersion: row.source_version, state: row.state,
    submittedAt: row.submitted_at.toISOString(), authority: row.review_authority, commandState: row.command_state, commandDecision: row.command_decision };
}

// Filter on the decision recorded in Control, not on bank acknowledgment.
// Snapshot state remains separately available in responses and eligibility.
export const reviewStatusSql = `CASE WHEN s.state='SUPERSEDED' THEN 'SUPERSEDED'
  WHEN command.decision='approve' THEN 'APPROVED'
  WHEN command.decision='request_revision' THEN 'REVISION_REQUIRED'
  WHEN command.decision='reject' THEN 'REJECTED' ELSE s.state END`;

export const reviewBaseQuery = `SELECT s.id::text, s.instance_id::text, i.display_name AS instance_name, s.resource_kind,
  s.source_id::text, s.source_version, s.payload_checksum, s.state, s.submitted_at, s.envelope_json,
  s.envelope_digest, s.contributor_subjects, i.enabled AS instance_enabled,
  to_char(s.submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS sort_time,
  (i.adapter_base_url IS NOT NULL AND i.adapter_audience IS NOT NULL AND i.control_signing_key_id IS NOT NULL
    AND i.bank_ack_key_id IS NOT NULL AND i.bank_ack_public_key IS NOT NULL) AS adapter_configured,
  i.control_signing_key_id AS configured_key_id, latest.id::text AS latest_id, latest.source_version AS latest_version,
  command.created_at AS command_created_at, reason.body AS command_note,
  i.review_authority, command.id::text AS command_id, command.state AS command_state,
  command.decision AS command_decision, command.result_code AS command_result_code
  FROM control.review_snapshots s JOIN control.instances i ON i.id = s.instance_id
  LEFT JOIN LATERAL (SELECT newer.id,newer.source_version FROM control.review_snapshots newer
    WHERE newer.instance_id=s.instance_id AND newer.resource_kind=s.resource_kind AND newer.source_id=s.source_id
    ORDER BY newer.source_version DESC,newer.id DESC LIMIT 1) latest ON true
  LEFT JOIN LATERAL (SELECT c.id, c.state, c.decision, c.result_code, c.created_at, c.reason_reference FROM control.review_commands c
    WHERE c.snapshot_id = s.id AND c.instance_id=s.instance_id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) command ON true
  LEFT JOIN control.review_reasons reason ON reason.id=command.reason_reference AND reason.instance_id=s.instance_id AND reason.snapshot_id=s.id`;

export function reviewActions(principal: Principal,row: ReviewRow,envelope: ReviewSnapshotEnvelope): ReviewAction[] {
  const config=getRuntimeConfig();
  return reviewActionEligibility(principal,{id:row.id,instanceId:row.instance_id,kind:row.resource_kind,
    state:row.state as ReviewSnapshot["state"],version:row.source_version,checksum:row.payload_checksum,contributors:envelope.contributor_subjects},
  {authority:row.review_authority,enabled:row.instance_enabled,newer:row.latest_version>row.source_version,hasDecision:row.command_id!==null,
    integrationEnabled:config.CONTROL_ENABLE_BANK_INTEGRATION,adapterConfigured:row.adapter_configured && Boolean(config.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE),
    keyMatches:row.configured_key_id===config.CONTROL_BANK_SIGNING_KEY_ID});
}

export async function listPendingReviews(principal: Principal): Promise<ReviewListItem[]> {
  const ids = reviewInstanceIds(principal);
  if (ids.length === 0) return [];
  const rows = await query<ReviewRow>(`${reviewBaseQuery}
    WHERE s.instance_id = ANY($1::uuid[]) AND s.state = 'IN_REVIEW' AND command.id IS NULL AND s.envelope_json IS NOT NULL
    ORDER BY s.submitted_at ASC, s.id ASC LIMIT 100`, [ids]);
  return rows.map(row => projectReview(row, parseReviewEnvelope(row)));
}

export async function getReviewDetail(principal: Principal, reviewId: string, expectedInstanceId?: string): Promise<ReviewDetailView | null> {
  if (!uuidPattern.test(reviewId) || (expectedInstanceId && !uuidPattern.test(expectedInstanceId))) throw new RequestValidationError("REVIEW_ID_INVALID");
  const rows = await query<ReviewRow>(`${reviewBaseQuery} WHERE s.id = $1 AND s.envelope_json IS NOT NULL`, [reviewId]);
  const row = rows[0];
  if (!row) return null;
  if (!authorize(principal, "review.read", row.instance_id).allowed) throw new AuthorizationError();
  if (expectedInstanceId && row.instance_id!==expectedInstanceId) throw new RequestValidationError("REVIEW_TARGET_MISMATCH");
  const envelope = parseReviewEnvelope(row);
  return reviewDetailReadSchema.parse({ ...projectReview(row, envelope), sourceId: row.source_id, checksum: row.payload_checksum,
    detail: envelope.detail, commandId: row.command_id, commandDecision: row.command_decision,
    commandResultCode: row.command_result_code,
    resultCheck: await reviewResultAction(principal, row.instance_id, row.command_id),
    actions:reviewActions(principal,row,envelope),
    decision:row.command_id && row.command_decision && row.command_created_at && row.command_state ? {
      action:row.command_decision,note:row.command_note,recordedAt:row.command_created_at.toISOString(),applicationState:row.command_state,resultCode:row.command_result_code } : null,
    versions:{submitted:row.source_version,latestReceived:{id:row.latest_id,version:row.latest_version},bankCurrent:null,bankCurrentAvailability:"NOT_AVAILABLE"} });
}

type MediaInstanceRow = QueryResultRow & {
  id: string; enabled: boolean; review_authority: "local" | "central"; adapter_base_url: string | null;
  control_signing_key_id: string | null; bank_ack_key_id: string | null; bank_ack_public_key: string | null;
};

function snapshotMedia(detail: ReviewDetail, mediaId: string) {
  if (detail.kind === "contact") return null;
  if (detail.kind === "profile") return detail.logo.source_media_id === mediaId ? detail.logo : null;
  if (detail.kind === "change_request") return detail.media.find(media => media.source_media_id === mediaId) ?? null;
  return detail.media.find(media => media.source_media_id === mediaId) ?? null;
}

function adapterOrigin(value: string, production: boolean): URL {
  const target = new URL(value);
  const loopback = ["127.0.0.1", "localhost"].includes(target.hostname);
  if (target.username || target.password || target.search || target.hash || target.pathname !== "/" ||
      (production && target.protocol !== "https:") ||
      (!production && target.protocol !== "https:" && !(loopback && target.protocol === "http:"))) {
    throw new IntegrationUnavailableError("BANK_ADAPTER_URL_INVALID");
  }
  return target;
}

export async function getReviewMedia(principal: Principal, instanceId: string, reviewId: string, mediaId: string): Promise<ReviewMedia> {
  if (!uuidPattern.test(instanceId) || !uuidPattern.test(reviewId) || !uuidPattern.test(mediaId)) throw new RequestValidationError("REVIEW_MEDIA_ID_INVALID");
  const rows = await query<ReviewRow>(`${reviewBaseQuery} WHERE s.id = $1 AND s.instance_id = $2 AND s.envelope_json IS NOT NULL`, [reviewId, instanceId]);
  const row = rows[0];
  if (!row) throw new RequestValidationError("REVIEW_NOT_FOUND");
  if (!authorize(principal, "review.read", row.instance_id).allowed) throw new AuthorizationError();
  const envelope = parseReviewEnvelope(row);
  const media = snapshotMedia(envelope.detail, mediaId);
  if (!media) throw new RequestValidationError("REVIEW_MEDIA_NOT_FOUND");

  const config = getRuntimeConfig();
  if (!config.CONTROL_ENABLE_BANK_INTEGRATION || !config.CONTROL_BANK_SIGNING_KEY_ID || !config.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE) {
    throw new IntegrationUnavailableError("BANK_INTEGRATION_DISABLED");
  }
  const instances = await query<MediaInstanceRow>(`SELECT id::text, enabled, review_authority, adapter_base_url,
    control_signing_key_id, bank_ack_key_id, bank_ack_public_key FROM control.instances WHERE id = $1`, [row.instance_id]);
  const instance = instances[0];
  if (!instance?.enabled || instance.review_authority !== "central" || !instance.adapter_base_url ||
      instance.control_signing_key_id !== config.CONTROL_BANK_SIGNING_KEY_ID || !instance.bank_ack_key_id || !instance.bank_ack_public_key) {
    throw new IntegrationUnavailableError("BANK_ADAPTER_NOT_CONFIGURED");
  }
  const privateKey = await readFile(config.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE, "utf8");
  if (privateKey.length < 80 || privateKey.length > 16_384 || !privateKey.includes("PRIVATE KEY")) {
    throw new IntegrationUnavailableError("CONTROL_SIGNING_KEY_INVALID");
  }
  const path = `/api/v1/internal/ruwang-control/sj-review/snapshots/${reviewId}/media/${mediaId}`;
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const emptyDigest = sha256Hex("");
  const requestMessage = createTransportSigningMessage({ method: "GET", path, timestamp, nonce, contentSha256: emptyDigest });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.CONTROL_BANK_REQUEST_TIMEOUT_MS);
  let response: Response;
  let body: Buffer;
  try {
    response = await fetch(new URL(path, adapterOrigin(instance.adapter_base_url, config.CONTROL_APP_ENV === "production")), {
      method: "GET", redirect: "error", cache: "no-store", signal: controller.signal,
      headers: {
        accept: media.detected_mime,
        [transportHeaderNames.instanceId]: instance.id,
        [transportHeaderNames.keyId]: config.CONTROL_BANK_SIGNING_KEY_ID,
        [transportHeaderNames.timestamp]: timestamp,
        [transportHeaderNames.nonce]: nonce,
        [transportHeaderNames.contentSha256]: emptyDigest,
        [transportHeaderNames.signature]: signTransport(requestMessage, privateKey),
      },
    });
    body = await readReviewMediaResponse(response);
  } catch (error) {
    const known = error instanceof Error && /^BANK_MEDIA_(HTTP_\d{3}|TOO_LARGE|EMPTY)$/.test(error.message);
    throw new IntegrationUnavailableError(known ? (error as Error).message :
      controller.signal.aborted ? "BANK_REQUEST_TIMEOUT" : "BANK_REQUEST_FAILED");
  } finally { clearTimeout(timeout); }
  const digest = sha256Hex(body);
  const header = (name: string) => response.headers.get(name)?.trim() ?? "";
  const responseTimestamp = header(transportHeaderNames.acknowledgmentTimestamp);
  const responseNonce = header(transportHeaderNames.acknowledgmentNonce);
  const responseKeyId = header(transportHeaderNames.acknowledgmentKeyId);
  const responseDigest = header(transportHeaderNames.acknowledgmentContentSha256);
  const responseSignature = header(transportHeaderNames.acknowledgmentSignature);
  const responseTime = Date.parse(responseTimestamp);
  if (responseKeyId !== instance.bank_ack_key_id || responseDigest !== digest ||
      !uuidPattern.test(responseNonce) || !Number.isFinite(responseTime) ||
      Math.abs(Date.now() - responseTime) > 300_000 || !responseSignature) {
    throw new IntegrationUnavailableError("BANK_MEDIA_SIGNATURE_INVALID");
  }
  const message = createTransportSigningMessage({ method: "GET", path, timestamp: responseTimestamp,
    nonce: responseNonce, contentSha256: digest });
  if (!verifyTransport(message, responseSignature, instance.bank_ack_public_key) ||
      response.headers.get("content-type")?.split(";")[0] !== media.detected_mime) {
    throw new IntegrationUnavailableError("BANK_MEDIA_SIGNATURE_INVALID");
  }
  try {
    await withTransaction(client => client.query(`INSERT INTO control.bank_ack_nonces
      (instance_id, key_id, nonce, expires_at) VALUES ($1,$2,$3,now() + interval '10 minutes')`,
    [instance.id, instance.bank_ack_key_id, responseNonce]));
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") throw new IntegrationUnavailableError("BANK_MEDIA_REPLAYED");
    throw error;
  }
  return { body, mime: media.detected_mime };
}
