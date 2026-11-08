import { readFile } from "node:fs/promises";
import type { QueryResultRow } from "pg";
import { getRuntimeConfig, type RuntimeConfig } from "@/src/lib/env";
import {
  canonicalJson,
  createTransportSigningMessage,
  payloadDigest,
  reviewAcknowledgmentSchema,
  reviewCommandSchema,
  reviewResultSchema,
  signTransport,
  transportHeaderNames,
  verifyTransport,
  type ReviewAcknowledgment,
  type ReviewCommand,
} from "@/src/domain/control-review-contract";
import { validateDecision, type ReviewSnapshot } from "@/src/domain/review";
import { query, withTransaction, type DatabaseClient } from "@/src/server/database";
import type { OperatorSession } from "@/src/server/auth/service";
import { ConflictError, IntegrationUnavailableError, RequestValidationError } from "@/src/server/errors";
import { currentDecisionPrincipal, lockReviewAggregate, requireCurrentSnapshot } from "@/src/server/review-guards";
import { authorize, type Principal } from "@/src/domain/authorization";

const commandPath = "/api/v1/internal/ruwang-control/sj-review/commands";
const resultPath = "/api/v1/internal/ruwang-control/sj-review/command-results";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type InstanceRow = QueryResultRow & {
  id: string;
  enabled: boolean;
  review_authority: "local" | "central";
  adapter_base_url: string | null;
  adapter_audience: string | null;
  control_signing_key_id: string | null;
  bank_ack_key_id: string | null;
  bank_ack_public_key: string | null;
};
type SnapshotRow = QueryResultRow & {
  id: string;
  instance_id: string;
  resource_kind: ReviewSnapshot["kind"];
  source_id: string;
  source_version: number;
  payload_checksum: string;
  state: ReviewSnapshot["state"];
  contributor_subjects: unknown;
};
type CommandRow = QueryResultRow & {
  id: string;
  snapshot_id: string;
  instance_id: string;
  state: "PENDING" | "DISPATCHING" | "APPLIED" | "REJECTED" | "UNKNOWN";
  request_payload: ReviewCommand;
  request_digest: string;
  result_code: string | null;
  acknowledgment_payload: ReviewAcknowledgment | null;
  decision_note?: string | null;
  target_digest?: string | null;
  dispatch_count?: number;
};

function targetDigest(instance: InstanceRow): string {
  return payloadDigest({ instance: instance.id, url: instance.adapter_base_url, audience: instance.adapter_audience,
    controlKey: instance.control_signing_key_id, bankKey: instance.bank_ack_key_id, bankPublicKey: instance.bank_ack_public_key });
}

// Lease expiry cannot prove that a bank effect did not occur. Fence the owner and
// retain UNKNOWN; do not requeue an uncertain command without a ledger-read API.
export async function recoverExpiredReviewCommands(instanceId: string, now = new Date()): Promise<number> {
  return withTransaction(async client => {
    const expired = await client.query<{ id: string; dispatch_attempt_id: string | null }>(`SELECT id, dispatch_attempt_id
      FROM control.review_commands WHERE instance_id = $1 AND state = 'DISPATCHING'
        AND (lease_expires_at IS NULL OR lease_expires_at <= $2)
      ORDER BY created_at, id LIMIT 100 FOR UPDATE SKIP LOCKED`, [instanceId, now]);
    for (const row of expired.rows) {
      await client.query(`UPDATE control.review_commands SET state = 'UNKNOWN', result_code = 'DISPATCH_LEASE_EXPIRED',
        dispatch_attempt_id = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = $1 AND state = 'DISPATCHING'`, [row.id]);
      await client.query(`UPDATE control.review_dispatch_attempts SET state = 'UNKNOWN', result_code = 'DISPATCH_LEASE_EXPIRED',
        finished_at = now() WHERE command_id = $1 AND state = 'DISPATCHING'`, [row.id]);
    }
    return expired.rows.length;
  });
}

// Trusted server-side cycle only; no public retry/admin endpoint or UI action.
// Pending (never sent) commands can be drained after restart. Unknowns stay held.
export async function runReviewDispatchCycle(instanceId: string): Promise<{ recovered: number; examined: number; applied: number; held: number; rejected: number; failed: number }> {
  const recovered = await recoverExpiredReviewCommands(instanceId);
  const pending = await query<{ id: string }>(`SELECT id::text FROM control.review_commands
    WHERE instance_id = $1 AND state = 'PENDING' ORDER BY created_at, id LIMIT 25`, [instanceId]);
  let applied = 0, held = 0, rejected = 0, failed = 0;
  for (const command of pending) {
    try {
      const result = await dispatchReviewCommand(command.id);
      if (result.state === "APPLIED") applied++;
      else if (result.state === "REJECTED") rejected++;
      else held++;
    } catch { failed++; }
  }
  return { recovered, examined: pending.length, applied, held, rejected, failed };
}

function parseContributors(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) throw new RequestValidationError("SNAPSHOT_CONTRIBUTORS_INVALID");
  return [...new Set(value)];
}

async function selectInstance(client: DatabaseClient, instanceId: string): Promise<InstanceRow> {
  await client.query("SELECT control.lock_review_authority($1::uuid)", [instanceId]);
  const result = await client.query<InstanceRow>(`
    SELECT id::text, enabled, review_authority, adapter_base_url, adapter_audience,
      control_signing_key_id, bank_ack_key_id, bank_ack_public_key
    FROM control.instances WHERE id = $1
  `, [instanceId]);
  const instance = result.rows[0];
  if (!instance || !instance.enabled || instance.review_authority !== "central") throw new IntegrationUnavailableError("CENTRAL_REVIEW_DISABLED");
  if (!instance.adapter_base_url || !instance.adapter_audience || !instance.control_signing_key_id ||
      !instance.bank_ack_key_id || !instance.bank_ack_public_key) throw new IntegrationUnavailableError("BANK_ADAPTER_NOT_CONFIGURED");
  return instance;
}

function assertTargetUrl(value: string, config: RuntimeConfig): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new IntegrationUnavailableError("BANK_ADAPTER_URL_INVALID");
  const loopback = ["127.0.0.1", "localhost"].includes(url.hostname);
  if ((config.CONTROL_APP_ENV === "production" && url.protocol !== "https:") ||
      (config.CONTROL_APP_ENV !== "production" && url.protocol !== "https:" && !(loopback && url.protocol === "http:"))) {
    throw new IntegrationUnavailableError("BANK_ADAPTER_URL_INVALID");
  }
  return url;
}

async function readPrivateKey(config: RuntimeConfig): Promise<string> {
  if (!config.CONTROL_ENABLE_BANK_INTEGRATION || !config.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE || !config.CONTROL_BANK_SIGNING_KEY_ID) {
    throw new IntegrationUnavailableError("BANK_INTEGRATION_DISABLED");
  }
  const key = await readFile(config.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE, "utf8");
  if (key.length < 80 || key.length > 16_384 || !key.includes("PRIVATE KEY")) throw new IntegrationUnavailableError("CONTROL_SIGNING_KEY_INVALID");
  return key;
}

async function audit(client: DatabaseClient, input: {
  requestId: string; actorSubject: string; instanceId: string; resourceKind: string; resourceId: string;
  action: string; outcome: string; reasonCode: string; resourceVersion: number;
}): Promise<void> {
  await client.query(`INSERT INTO control.audit_events
    (id, request_id, actor_subject, instance_id, resource_kind, resource_id, action, outcome, reason_code, resource_version)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [crypto.randomUUID(), input.requestId, input.actorSubject,
    input.instanceId, input.resourceKind, input.resourceId, input.action, input.outcome, input.reasonCode, input.resourceVersion]);
}

export type DecisionRequest = {
  commandId: string;
  instanceId: string;
  reviewId: string;
  decision: "approve" | "request_revision" | "reject";
  reason: string;
  expectedVersion: number;
  expectedChecksum: string;
  requestId: string;
  actor: OperatorSession;
};

export async function enqueueReviewDecision(input: DecisionRequest, now = new Date()): Promise<string> {
  if (!uuidPattern.test(input.commandId)) throw new RequestValidationError("IDEMPOTENCY_KEY_INVALID");
  const config = getRuntimeConfig();
  if (!config.CONTROL_ENABLE_BANK_INTEGRATION) throw new IntegrationUnavailableError("BANK_INTEGRATION_DISABLED");
  return withTransaction(async client => {
    const principal = await currentDecisionPrincipal(client, input.actor, input.instanceId, input.decision);
    const instance = await selectInstance(client, input.instanceId);
    if (instance.control_signing_key_id !== config.CONTROL_BANK_SIGNING_KEY_ID) throw new IntegrationUnavailableError("CONTROL_KEY_ID_MISMATCH");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`control:command:${input.commandId}`]);
    const prior = await client.query<CommandRow>(`SELECT c.*, r.body AS decision_note FROM control.review_commands c
      LEFT JOIN control.review_reasons r ON r.id=c.reason_reference AND r.instance_id=c.instance_id AND r.snapshot_id=c.snapshot_id WHERE c.id=$1`, [input.commandId]);
    if (prior.rows[0]) {
      const payload = reviewCommandSchema.parse(prior.rows[0].request_payload);
      const same = payload.actor_subject === `ruwang-control:${principal.id}` && payloadDigest(payload) === prior.rows[0].request_digest && prior.rows[0].snapshot_id === input.reviewId && payload.instance_id === input.instanceId && payload.decision === input.decision &&
        payload.expected_version === input.expectedVersion && payload.expected_checksum === input.expectedChecksum &&
        (prior.rows[0].decision_note ?? payload.reason ?? "") === input.reason.trim();
      if (!same) throw new ConflictError("IDEMPOTENCY_KEY_REUSED");
      return prior.rows[0].id;
    }

    const snapshotResult = await client.query<SnapshotRow>(`
      SELECT id::text, instance_id::text, resource_kind, source_id::text, source_version,
        payload_checksum, state, contributor_subjects
      FROM control.review_snapshots WHERE id = $1 AND instance_id = $2
    `, [input.reviewId, input.instanceId]);
    const row = snapshotResult.rows[0];
    if (!row) throw new RequestValidationError("REVIEW_NOT_FOUND");
    await lockReviewAggregate(client, row.instance_id, row.resource_kind, row.source_id);
    await requireCurrentSnapshot(client, row);
    const recorded = await client.query<CommandRow>(`SELECT c.*, r.body AS decision_note FROM control.review_commands c
      LEFT JOIN control.review_reasons r ON r.id=c.reason_reference AND r.instance_id=c.instance_id AND r.snapshot_id=c.snapshot_id
      WHERE c.snapshot_id = $1 ORDER BY c.created_at, c.id`, [row.id]);
    if (recorded.rows.length) {
      const existing = recorded.rows[0]!;
      const payload = reviewCommandSchema.parse(existing.request_payload);
      // A lost response or a second tab may generate a new key. Reuse the original intent only.
      if (recorded.rows.length === 1 && payload.actor_subject === `ruwang-control:${principal.id}` &&
          payload.decision === input.decision && payload.expected_version === input.expectedVersion &&
          payload.expected_checksum === input.expectedChecksum && (existing.decision_note ?? payload.reason ?? "") === input.reason.trim() &&
          payloadDigest(payload) === existing.request_digest) return existing.id;
      throw new ConflictError("DECISION_ALREADY_RECORDED");
    }
    // Ingress may have replaced the snapshot while this request waited for the aggregate lock.
    row.state = (await client.query<{ state: SnapshotRow["state"] }>("SELECT state FROM control.review_snapshots WHERE id = $1", [row.id])).rows[0]!.state;
    const contributors = parseContributors(row.contributor_subjects);
    const snapshot: ReviewSnapshot = { id: row.id, instanceId: row.instance_id, kind: row.resource_kind,
      state: row.state, version: row.source_version, checksum: row.payload_checksum, contributors };
    const validation = validateDecision(principal, snapshot, {
      instanceId: input.instanceId, reviewId: input.reviewId, decision: input.decision, reason: input.reason,
      expectedVersion: input.expectedVersion, expectedChecksum: input.expectedChecksum,
    }, { connected: true, authority: instance.review_authority, auditWritable: true });
    if (!validation.allowed) throw validation.reason === "STALE_SNAPSHOT" ? new ConflictError() : new RequestValidationError(validation.reason);

    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + config.CONTROL_BANK_COMMAND_TTL_SECONDS * 1000).toISOString();
    const command = reviewCommandSchema.parse({ contract_version: 1, command_id: input.commandId, instance_id: input.instanceId,
      actor_subject: `ruwang-control:${input.actor.operator.id}`, audience: instance.adapter_audience,
      resource: { kind: row.resource_kind, id: row.source_id }, decision: input.decision,
      contributor_subjects: contributors,
      ...(row.resource_kind === "change_request" || input.decision === "request_revision"
        ? { reason: input.reason.trim() }
        : {}),
      expected_version: input.expectedVersion, expected_checksum: input.expectedChecksum, issued_at: issuedAt, expires_at: expiresAt });
    const digest = payloadDigest(command);
    let reasonId: string | null = null;
    // Approval notes are Control audit data. The bank V1 contract forbids reason
    // on content approvals, so keep the transport payload unchanged above.
    if (input.reason.trim()) {
      reasonId = crypto.randomUUID();
      await client.query(`INSERT INTO control.review_reasons (id, instance_id, snapshot_id, body, created_by_operator_id)
        VALUES ($1,$2,$3,$4,$5)`, [reasonId, input.instanceId, input.reviewId, input.reason.trim(), input.actor.operator.id]);
    }
    await client.query(`INSERT INTO control.review_commands
      (id, snapshot_id, instance_id, actor_subject, decision, reason_reference, expected_version, expected_checksum,
       state, contract_version, request_payload, request_digest, target_digest)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',1,$9::jsonb,$10,$11)`, [input.commandId, input.reviewId, input.instanceId,
      command.actor_subject, input.decision, reasonId, input.expectedVersion, input.expectedChecksum, canonicalJson(command), digest, targetDigest(instance)]);
    await audit(client, { requestId: input.requestId, actorSubject: command.actor_subject, instanceId: input.instanceId,
      resourceKind: row.resource_kind, resourceId: row.source_id, action: `review.${input.decision}`,
      outcome: "queued", reasonCode: "COMMAND_PENDING", resourceVersion: row.source_version });
    return input.commandId;
  });
}

async function verifyAcknowledgment(input: { response: Response; bodyText: string; instance: InstanceRow; command: CommandRow; now: Date }): Promise<ReviewAcknowledgment> {
  if (input.bodyText.length > 65_536) throw new IntegrationUnavailableError("BANK_ACK_TOO_LARGE");
  let body: unknown;
  try { body = JSON.parse(input.bodyText); } catch { throw new IntegrationUnavailableError("BANK_ACK_INVALID_JSON"); }
  const acknowledgment = reviewAcknowledgmentSchema.safeParse(body);
  if (!acknowledgment.success) throw new IntegrationUnavailableError("BANK_ACK_INVALID");
  const header = (name: string) => input.response.headers.get(name) ?? "";
  const keyId = header(transportHeaderNames.acknowledgmentKeyId);
  const timestamp = header(transportHeaderNames.acknowledgmentTimestamp);
  const nonce = header(transportHeaderNames.acknowledgmentNonce);
  const digest = payloadDigest(acknowledgment.data);
  if (keyId !== input.instance.bank_ack_key_id || !uuidPattern.test(nonce) ||
      header(transportHeaderNames.acknowledgmentContentSha256) !== digest) throw new IntegrationUnavailableError("BANK_ACK_HEADERS_INVALID");
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(input.now.getTime() - timestampMs) > 300_000) throw new IntegrationUnavailableError("BANK_ACK_EXPIRED");
  const message = createTransportSigningMessage({ method: "POST", path: commandPath, timestamp, nonce, contentSha256: digest });
  if (!verifyTransport(message, header(transportHeaderNames.acknowledgmentSignature), input.instance.bank_ack_public_key!)) {
    throw new IntegrationUnavailableError("BANK_ACK_SIGNATURE_INVALID");
  }
  validateAcknowledgmentResult(acknowledgment.data, input.command, input.instance);
  return acknowledgment.data;
}

function validateAcknowledgmentResult(data: ReviewAcknowledgment, command: CommandRow, instance: InstanceRow) {
  const acknowledgment = { data };
  const input = { command, instance };
  if (acknowledgment.data.command_id !== input.command.id || acknowledgment.data.command_digest !== input.command.request_digest ||
      acknowledgment.data.instance_id !== input.instance.id || acknowledgment.data.resource.id !== input.command.request_payload.resource.id ||
      acknowledgment.data.resource.kind !== input.command.request_payload.resource.kind) throw new IntegrationUnavailableError("BANK_ACK_SCOPE_INVALID");
  if (acknowledgment.data.status === "APPLIED") {
    const expected = input.command.request_payload;
    // Bank changes content aggregate lock_version, but lifecycle request_version
    // and its impact checksum remain fixed through applyControlChangeDecision.
    const appliedVersion = expected.expected_version + (expected.resource.kind === "change_request" ? 0 : 1);
    // Publication approval rebuilds its public payload with publication timestamps.
    // Its signed observed_checksum describes that result, not the submitted payload.
    const rebuildsPayload = expected.resource.kind === "publication" && expected.decision === "approve";
    if (acknowledgment.data.result_code !== "DECISION_APPLIED" || acknowledgment.data.observed_version !== appliedVersion ||
        (!rebuildsPayload && acknowledgment.data.observed_checksum !== expected.expected_checksum)) throw new IntegrationUnavailableError("BANK_ACK_RESULT_INVALID");
  }
}

async function boundedResultBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new IntegrationUnavailableError("BANK_RESULT_INVALID");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 65_536) throw new IntegrationUnavailableError("BANK_RESULT_TOO_LARGE");
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

export async function reviewResultAction(principal: Principal, instanceId: string, commandId: string | null) {
  if (!commandId || !authorize(principal, "review.approve", instanceId).allowed) return null;
  return withTransaction(async client => {
    const rows = await client.query<CommandRow>("SELECT * FROM control.review_commands WHERE id=$1 AND instance_id=$2", [commandId, instanceId]);
    const command = rows.rows[0];
    if (!command || command.state !== "UNKNOWN") return null;
    const config = getRuntimeConfig();
    if (!config.CONTROL_ENABLE_BANK_INTEGRATION || !config.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE) return { allowed: false, reason: "Koneksi pemeriksaan belum aktif." };
    try {
      const instance = await selectInstance(client, instanceId);
      if (!command.target_digest || command.target_digest !== targetDigest(instance)) return { allowed: false, reason: "Tujuan pengiriman berubah. Hasil belum bisa diperiksa dengan koneksi ini." };
      if (instance.control_signing_key_id !== config.CONTROL_BANK_SIGNING_KEY_ID) return { allowed: false, reason: "Kunci koneksi pemeriksaan tidak sesuai." };
      return { allowed: true, reason: null };
    } catch (error) {
      if (!(error instanceof IntegrationUnavailableError)) throw error;
      return { allowed: false, reason: "Koneksi pemeriksaan belum tersedia." };
    }
  });
}

// Lookup only, never resend. An authenticated absence remains UNKNOWN. The
// immutable command/target binding is rechecked before and after the request.
export async function reconcileReviewCommand(input: { instanceId: string; commandId: string; actor: OperatorSession; requestId: string }) {
  const config = getRuntimeConfig(), privateKey = await readPrivateKey(config);
  const load = async (client: DatabaseClient) => {
    const rows = await client.query<CommandRow>("SELECT * FROM control.review_commands WHERE id=$1 AND instance_id=$2", [input.commandId, input.instanceId]);
    const command = rows.rows[0];
    if (!command) throw new RequestValidationError("COMMAND_NOT_FOUND");
    command.request_payload = reviewCommandSchema.parse(command.request_payload);
    await currentDecisionPrincipal(client, input.actor, input.instanceId, command.request_payload.decision);
    const instance = await selectInstance(client, input.instanceId);
    if (!command.target_digest || command.target_digest !== targetDigest(instance)) throw new ConflictError("COMMAND_TARGET_CHANGED");
    const payload = command.request_payload;
    if (payload.command_id !== command.id || payload.instance_id !== input.instanceId || payload.audience !== instance.adapter_audience ||
        payloadDigest(payload) !== command.request_digest || instance.control_signing_key_id !== config.CONTROL_BANK_SIGNING_KEY_ID) {
      throw new IntegrationUnavailableError("COMMAND_STORED_INVALID");
    }
    return { command, instance };
  };
  const loaded = await withTransaction(load);
  if (loaded.command.state !== "UNKNOWN") return { state: loaded.command.state, resultCode: loaded.command.result_code };
  const nonce = crypto.randomUUID(), timestamp = new Date().toISOString();
  const lookup = { contract_version: 1, command_id: input.commandId, command_digest: loaded.command.request_digest,
    instance_id: input.instanceId, audience: loaded.instance.adapter_audience, resource: loaded.command.request_payload.resource };
  const digest = payloadDigest(lookup);
  let response: Response;
  try { response = await fetch(new URL(resultPath, assertTargetUrl(loaded.instance.adapter_base_url!, config)), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(config.CONTROL_BANK_REQUEST_TIMEOUT_MS),
    headers: { "content-type": "application/json", "accept": "application/json",
      [transportHeaderNames.instanceId]: input.instanceId, [transportHeaderNames.keyId]: config.CONTROL_BANK_SIGNING_KEY_ID!,
      [transportHeaderNames.timestamp]: timestamp, [transportHeaderNames.nonce]: nonce,
      [transportHeaderNames.contentSha256]: digest, [transportHeaderNames.signature]: signTransport(createTransportSigningMessage({
        method: "POST", path: resultPath, timestamp, nonce, contentSha256: digest }), privateKey) }, body: canonicalJson(lookup),
  }); } catch { throw new IntegrationUnavailableError("BANK_RESULT_UNAVAILABLE"); }
  if (response.status !== 200) throw new IntegrationUnavailableError("BANK_RESULT_HTTP_INVALID");
  if (response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    await response.body?.cancel();
    throw new IntegrationUnavailableError("BANK_RESULT_INVALID");
  }
  let result: ReturnType<typeof reviewResultSchema.parse>;
  try { result = reviewResultSchema.parse(JSON.parse(await boundedResultBody(response))); }
  catch { throw new IntegrationUnavailableError("BANK_RESULT_INVALID"); }
  const header = (name: string) => response.headers.get(name) ?? "";
  const responseNonce = header(transportHeaderNames.acknowledgmentNonce), responseTime = header(transportHeaderNames.acknowledgmentTimestamp);
  const resultDigest = payloadDigest(result), checked = Date.parse(result.checked_at), now = Date.now();
  if (header(transportHeaderNames.acknowledgmentKeyId) !== loaded.instance.bank_ack_key_id || !uuidPattern.test(responseNonce) ||
      header(transportHeaderNames.acknowledgmentContentSha256) !== resultDigest || !Number.isFinite(Date.parse(responseTime)) ||
      Math.abs(now - Date.parse(responseTime)) > 300_000 || Math.abs(now - checked) > 300_000 ||
      result.request_nonce !== nonce || result.command_id !== input.commandId || result.instance_id !== input.instanceId ||
      result.command_digest !== loaded.command.request_digest || result.resource.kind !== lookup.resource.kind || result.resource.id !== lookup.resource.id ||
      !verifyTransport(createTransportSigningMessage({ method: "POST", path: resultPath, timestamp: responseTime,
        nonce: responseNonce, contentSha256: resultDigest }), header(transportHeaderNames.acknowledgmentSignature), loaded.instance.bank_ack_public_key!)) {
    throw new IntegrationUnavailableError("BANK_RESULT_INVALID");
  }
  const ack = result.acknowledgment;
  if (ack) validateAcknowledgmentResult(ack, loaded.command, loaded.instance);
  return withTransaction(async client => {
    const current = await load(client);
    await lockReviewAggregate(client, input.instanceId, lookup.resource.kind, lookup.resource.id);
    const locked = await client.query<CommandRow>("SELECT * FROM control.review_commands WHERE id=$1 AND instance_id=$2 FOR UPDATE", [input.commandId, input.instanceId]);
    const command = locked.rows[0]!;
    if (command.state !== "UNKNOWN") return { state: command.state, resultCode: command.result_code };
    if (command.request_digest !== loaded.command.request_digest || command.target_digest !== loaded.command.target_digest ||
        targetDigest(current.instance) !== targetDigest(loaded.instance)) throw new ConflictError("COMMAND_STORED_CHANGED");
    await client.query("DELETE FROM control.bank_ack_nonces WHERE expires_at <= now()");
    await client.query("INSERT INTO control.bank_ack_nonces(instance_id,key_id,nonce,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
      [input.instanceId, loaded.instance.bank_ack_key_id, responseNonce]);
    if (ack) {
      await client.query(`UPDATE control.review_commands SET state=$2,result_code=$3,acknowledgment_payload=$4::jsonb,
        acknowledgment_digest=$5,acknowledged_at=$6,updated_at=now() WHERE id=$1 AND state='UNKNOWN'`,
        [input.commandId, ack.status, ack.result_code, canonicalJson(ack), payloadDigest(ack), ack.processed_at]);
      if (ack.status === "APPLIED") {
        // Preserve a newer/superseding submission and all original failed attempts.
        await client.query(`UPDATE control.review_snapshots s SET state=$2 WHERE s.id=$1 AND s.state='IN_REVIEW'
          AND NOT EXISTS (SELECT 1 FROM control.review_snapshots newer WHERE newer.instance_id=s.instance_id
            AND newer.resource_kind=s.resource_kind AND newer.source_id=s.source_id AND newer.source_version>s.source_version)`,
          [command.snapshot_id, command.request_payload.decision === "approve" ? "APPROVED" : command.request_payload.decision === "reject" ? "REJECTED" : "REVISION_REQUIRED"]);
      }
    }
    await audit(client, { requestId: input.requestId, actorSubject: `ruwang-control:${input.actor.operator.id}`, instanceId: input.instanceId,
      resourceKind: lookup.resource.kind, resourceId: lookup.resource.id, action: "review.reconcile", outcome: ack ? "resolved" : "unknown",
      reasonCode: ack ? ack.result_code : "COMMAND_NOT_RECORDED", resourceVersion: loaded.command.request_payload.expected_version });
    return { state: ack?.status ?? "UNKNOWN", resultCode: ack?.result_code ?? "COMMAND_NOT_RECORDED" };
  });
}

export async function dispatchReviewCommand(commandId: string, now = new Date()): Promise<CommandRow> {
  const config = getRuntimeConfig();
  const privateKey = await readPrivateKey(config);
  const nonce = crypto.randomUUID();
  const attemptId = crypto.randomUUID();
  const loaded = await withTransaction(async client => {
    const identity = await client.query<CommandRow>("SELECT instance_id::text, request_payload FROM control.review_commands WHERE id = $1", [commandId]);
    if (!identity.rows[0]) throw new RequestValidationError("COMMAND_NOT_FOUND");
    const payload = reviewCommandSchema.parse(identity.rows[0].request_payload);
    const instance = await selectInstance(client, identity.rows[0].instance_id);
    await lockReviewAggregate(client, instance.id, payload.resource.kind, payload.resource.id);
    const commandResult = await client.query<CommandRow>(`SELECT id::text, snapshot_id::text, instance_id::text, state, request_payload,
      request_digest, result_code, acknowledgment_payload, target_digest, dispatch_count FROM control.review_commands WHERE id = $1 FOR UPDATE`, [commandId]);
    const command = commandResult.rows[0];
    if (!command) throw new RequestValidationError("COMMAND_NOT_FOUND");
    command.request_payload = reviewCommandSchema.parse(command.request_payload);
    // Never resend an uncertain/in-flight command from another click or tab.
    // Recovery of UNKNOWN requires the bank ledger contract, not a new command.
    if (command.state !== "PENDING") return { terminal: true as const, command };
    if (!command.target_digest || command.target_digest !== targetDigest(instance) || command.dispatch_count !== 0) {
      const code = !command.target_digest ? "COMMAND_TARGET_UNBOUND" : command.dispatch_count !== 0 ? "COMMAND_ATTEMPT_LIMIT" : "COMMAND_TARGET_CHANGED";
      await client.query("UPDATE control.review_commands SET state = 'UNKNOWN', result_code = $2, updated_at = now() WHERE id = $1 AND state = 'PENDING'", [commandId, code]);
      return { terminal: true as const, command: { ...command, state: "UNKNOWN" as const, result_code: code } };
    }
    if (payloadDigest(command.request_payload) !== command.request_digest || payload.command_id !== command.id ||
        payload.instance_id !== command.instance_id || payload.audience !== instance.adapter_audience ||
        instance.control_signing_key_id !== config.CONTROL_BANK_SIGNING_KEY_ID) throw new IntegrationUnavailableError("COMMAND_STORED_INVALID");
    const snapshot = await client.query<SnapshotRow>(`SELECT id::text, instance_id::text, resource_kind, source_id::text,
      source_version, payload_checksum, state, contributor_subjects FROM control.review_snapshots WHERE id = $1`, [command.snapshot_id]);
    const row = snapshot.rows[0];
    if (!row || row.instance_id !== instance.id || row.resource_kind !== payload.resource.kind || row.source_id !== payload.resource.id ||
        row.source_version !== payload.expected_version || row.payload_checksum !== payload.expected_checksum) throw new IntegrationUnavailableError("COMMAND_SNAPSHOT_MISMATCH");
    try {
      await requireCurrentSnapshot(client, row);
      if (row.state !== "IN_REVIEW") throw new ConflictError("SNAPSHOT_SUPERSEDED");
      if (Date.parse(payload.expires_at) <= now.getTime()) throw new ConflictError("COMMAND_EXPIRED_BEFORE_SEND");
      if (parseContributors(row.contributor_subjects).includes(payload.actor_subject)) throw new ConflictError("SELF_REVIEW");
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      await client.query("UPDATE control.review_commands SET state = 'REJECTED', result_code = $2, updated_at = now() WHERE id = $1 AND state = 'PENDING'", [commandId, error.code]);
      return { terminal: true as const, command: { ...command, state: "REJECTED" as const, result_code: error.code } };
    }
    const target = assertTargetUrl(instance.adapter_base_url!, config);
    // Operational lease covers network timeout plus database completion budget.
    const leaseMs = config.CONTROL_BANK_REQUEST_TIMEOUT_MS + 2 * config.CONTROL_DB_STATEMENT_TIMEOUT_MS + config.CONTROL_DB_CONNECT_TIMEOUT_MS + 1000;
    await client.query(`UPDATE control.review_commands SET state = 'DISPATCHING', dispatch_attempt_id = $2,
      lease_expires_at = clock_timestamp() + $3 * interval '1 millisecond', dispatch_count = dispatch_count + 1,
      updated_at = now() WHERE id = $1 AND state = 'PENDING'`, [commandId, attemptId, leaseMs]);
    await client.query(`INSERT INTO control.review_dispatch_attempts
      (id, command_id, instance_id, nonce, request_digest, state) VALUES ($1,$2,$3,$4,$5,'DISPATCHING')`,
    [attemptId, commandId, command.instance_id, nonce, command.request_digest]);
    return { terminal: false as const, command, instance, target };
  });
  if (loaded.terminal) return loaded.command;

  const timestamp = now.toISOString();
  const message = createTransportSigningMessage({ method: "POST", path: commandPath, timestamp, nonce, contentSha256: loaded.command.request_digest });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.CONTROL_BANK_REQUEST_TIMEOUT_MS);
  try {
    const url = new URL(commandPath, loaded.target);
    const response = await fetch(url, { method: "POST", redirect: "error", signal: controller.signal,
      headers: { "content-type": "application/json", "accept": "application/json",
        [transportHeaderNames.instanceId]: loaded.instance.id,
        [transportHeaderNames.keyId]: config.CONTROL_BANK_SIGNING_KEY_ID!,
        [transportHeaderNames.timestamp]: timestamp,
        [transportHeaderNames.nonce]: nonce,
        [transportHeaderNames.contentSha256]: loaded.command.request_digest,
        [transportHeaderNames.signature]: signTransport(message, privateKey) },
      body: canonicalJson(loaded.command.request_payload) });
    if (response.status !== 200) throw new IntegrationUnavailableError("BANK_ACK_HTTP_INVALID");
    const reader = response.body?.getReader();
    if (!reader) throw new IntegrationUnavailableError("BANK_ACK_INVALID");
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 65_536) throw new IntegrationUnavailableError("BANK_ACK_TOO_LARGE");
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bodyText = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const acknowledgment = await verifyAcknowledgment({ response, bodyText, instance: loaded.instance, command: loaded.command, now: new Date() });
    return withTransaction(async client => {
      await lockReviewAggregate(client, loaded.instance.id, loaded.command.request_payload.resource.kind, loaded.command.request_payload.resource.id);
      const owned = await client.query(`SELECT id FROM control.review_commands WHERE id = $1 AND state = 'DISPATCHING'
        AND dispatch_attempt_id = $2 AND lease_expires_at > clock_timestamp() FOR UPDATE`, [commandId, attemptId]);
      if (!owned.rowCount) {
        const current = await client.query<CommandRow>("SELECT * FROM control.review_commands WHERE id = $1", [commandId]);
        return current.rows[0]!;
      }
      const ackNonce = response.headers.get(transportHeaderNames.acknowledgmentNonce)!;
      const ackKeyId = response.headers.get(transportHeaderNames.acknowledgmentKeyId)!;
      await client.query("DELETE FROM control.bank_ack_nonces WHERE expires_at <= now()");
      await client.query(`INSERT INTO control.bank_ack_nonces (instance_id, key_id, nonce, expires_at)
        VALUES ($1,$2,$3,now() + interval '10 minutes')`, [loaded.instance.id, ackKeyId, ackNonce]);
      const state = acknowledgment.status === "APPLIED" ? "APPLIED" : "REJECTED";
      await client.query(`UPDATE control.review_commands SET state = $2, result_code = $3,
        acknowledgment_payload = $4::jsonb, acknowledgment_digest = $5, acknowledged_at = $6,
        dispatch_attempt_id = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND state = 'DISPATCHING' AND dispatch_attempt_id = $7`,
      [commandId, state, acknowledgment.result_code, canonicalJson(acknowledgment), payloadDigest(acknowledgment), acknowledgment.processed_at, attemptId]);
      if (state === "APPLIED") {
        await client.query("UPDATE control.review_snapshots SET state = $2 WHERE id = $1 AND state = 'IN_REVIEW'", [
          loaded.command.snapshot_id,
          loaded.command.request_payload.decision === "approve"
            ? "APPROVED"
            : loaded.command.request_payload.decision === "reject"
              ? "REJECTED"
              : "REVISION_REQUIRED",
        ]);
      }
      await client.query(`UPDATE control.review_dispatch_attempts SET state = $2, http_status = $3,
        result_code = $4, finished_at = now() WHERE id = $1`, [attemptId, state === "APPLIED" ? "ACKNOWLEDGED" : "REJECTED", response.status, acknowledgment.result_code]);
      const refreshed = await client.query<CommandRow>(`SELECT id::text, snapshot_id::text, instance_id::text, state, request_payload,
        request_digest, result_code, acknowledgment_payload FROM control.review_commands WHERE id = $1`, [commandId]);
      return refreshed.rows[0]!;
    });
  } catch (error) {
    await withTransaction(async client => {
      const updated = await client.query(`UPDATE control.review_commands SET state = 'UNKNOWN', result_code = $2,
        dispatch_attempt_id = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND state = 'DISPATCHING' AND dispatch_attempt_id = $3`,
        [commandId, error instanceof IntegrationUnavailableError ? error.code : "BANK_REQUEST_UNKNOWN", attemptId]);
      if (!updated.rowCount) return;
      await client.query(`UPDATE control.review_dispatch_attempts SET state = 'UNKNOWN', result_code = $2,
        finished_at = now() WHERE id = $1`, [attemptId, error instanceof IntegrationUnavailableError ? error.code : "BANK_REQUEST_UNKNOWN"]);
    });
    if (error instanceof IntegrationUnavailableError) throw error;
    throw new IntegrationUnavailableError(error instanceof Error && error.name === "AbortError" ? "BANK_REQUEST_TIMEOUT" : "BANK_REQUEST_FAILED");
  } finally { clearTimeout(timeout); }
}

export async function getReviewCommand(instanceId: string, commandId: string): Promise<CommandRow | null> {
  const rows = await query<CommandRow>(`SELECT c.id::text, c.snapshot_id::text, c.instance_id::text, c.state, c.request_payload,
    c.request_digest, c.result_code, c.acknowledgment_payload, r.body AS decision_note FROM control.review_commands c
    LEFT JOIN control.review_reasons r ON r.id=c.reason_reference AND r.instance_id=c.instance_id AND r.snapshot_id=c.snapshot_id
    WHERE c.id = $1 AND c.instance_id = $2`,
  [commandId, instanceId]);
  return rows[0] ?? null;
}
