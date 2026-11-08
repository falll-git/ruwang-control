import { authorize, type Action, type Principal } from "@/src/domain/authorization";
import { registeredInternalScopes } from "@/src/server/auth/internal-access";
import { payloadDigest } from "@/src/domain/control-review-contract";
import { reviewSnapshotEnvelopeSchema } from "@/src/domain/review-snapshot";
import type { OperatorSession } from "@/src/server/auth/service";
import type { DatabaseClient } from "@/src/server/database";
import { AuthorizationError, ConflictError, RequestValidationError, SessionExpiredError } from "@/src/server/errors";

export async function lockReviewAggregate(client: DatabaseClient, instanceId: string, kind: string, sourceId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`control:review:${instanceId}:${kind}:${sourceId}`]);
}

// Re-read permissions inside the decision transaction, including idempotent replays.
export async function currentDecisionPrincipal(client: DatabaseClient, actor: OperatorSession, instanceId: string, decision: string): Promise<Principal> {
  return currentActionPrincipal(client,actor,instanceId,decision === "approve" ? "review.approve" : "review.request_revision");
}

export async function currentActionPrincipal(client: DatabaseClient, actor: OperatorSession, instanceId: string, action: Action): Promise<Principal> {
  await client.query("SELECT control.lock_review_authority($1::uuid, $2::uuid)", [instanceId, actor.operator.id]);
  const principal = await currentOperatorPrincipal(client, actor);
  if (!authorize(principal, action, instanceId).allowed) throw new AuthorizationError();
  return principal;
}

export async function currentOperatorPrincipal(client: DatabaseClient, actor: OperatorSession): Promise<Principal> {
  await client.query("SELECT control.lock_review_authority(NULL::uuid, $1::uuid)", [actor.operator.id]);
  const session = await client.query(`SELECT s.id FROM control.operator_sessions s
    JOIN control.operators o ON o.id = s.operator_id
    WHERE s.id = $1 AND s.operator_id = $2 AND s.revoked_at IS NULL
      AND s.idle_expires_at > now() AND s.absolute_expires_at > now() AND o.status = 'active'
      AND o.access_role = 'internal_operator'
    FOR SHARE OF s`, [actor.sessionId, actor.operator.id]);
  if (session.rowCount !== 1) throw new SessionExpiredError();
  const principal: Principal = { id: actor.operator.id, issuer: "ruwang-control", active: true, sessionVerified: true,
    grants: await registeredInternalScopes(client, actor.operator.id) };
  return principal;
}

export async function requireCurrentSnapshot(client: DatabaseClient, row: {
  id: string; instance_id: string; resource_kind: string; source_id: string;
  source_version: number; payload_checksum: string;
}) {
  const stored = await client.query<{ envelope_json: unknown; envelope_digest: string }>(
    "SELECT envelope_json, envelope_digest FROM control.review_snapshots WHERE id = $1", [row.id]);
  const value = stored.rows[0];
  const parsed = reviewSnapshotEnvelopeSchema.safeParse(value?.envelope_json);
  if (!parsed.success || payloadDigest(parsed.data) !== value?.envelope_digest ||
      parsed.data.snapshot_id !== row.id || parsed.data.instance_id !== row.instance_id ||
      parsed.data.resource.kind !== row.resource_kind || parsed.data.resource.id !== row.source_id ||
      parsed.data.source_version !== row.source_version || parsed.data.payload_checksum !== row.payload_checksum) {
    throw new RequestValidationError("SNAPSHOT_STORED_INVALID");
  }
  const newer = await client.query(`SELECT id FROM control.review_snapshots
    WHERE instance_id = $1 AND resource_kind = $2 AND source_id = $3 AND source_version > $4 LIMIT 1`,
  [row.instance_id, row.resource_kind, row.source_id, row.source_version]);
  if (newer.rowCount) throw new ConflictError("SNAPSHOT_SUPERSEDED");
  return parsed.data;
}
