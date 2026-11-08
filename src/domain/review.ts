import { authorize, type Principal } from "./authorization.ts";

export type ReviewKind = "publication" | "profile" | "contact" | "change_request";
export interface ReviewSnapshot {
  id: string;
  instanceId: string;
  kind: ReviewKind;
  state: "IN_REVIEW" | "REVISION_REQUIRED" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  version: number;
  checksum: string;
  /** Qualified subjects (issuer:id); never compare bare IDs across identity domains. */
  contributors: readonly string[];
}
export interface DecisionInput {
  instanceId: string;
  reviewId: string;
  expectedVersion: number;
  expectedChecksum: string;
  decision: "approve" | "request_revision" | "reject";
  reason: string;
}
export type DecisionResult = { allowed: true; next: "COMMAND_PENDING" } | { allowed: false; reason: string };

/** Pre-dispatch checks only; source bank must repeat checks inside its transaction. */
export function validateDecision(
  principal: Principal | null,
  snapshot: ReviewSnapshot,
  input: DecisionInput,
  context: { connected: boolean; authority: "local" | "central"; auditWritable: boolean },
): DecisionResult {
  if (!["approve", "request_revision", "reject"].includes(input.decision)) return { allowed: false, reason: "INVALID_DECISION" };
  const lifecycle = snapshot.kind === "change_request";
  if (!lifecycle && input.decision === "reject") return { allowed: false, reason: "INVALID_DECISION" };
  const action = input.decision === "approve" ? "review.approve" : "review.request_revision";
  const access = authorize(principal, action, input.instanceId);
  if (!access.allowed) return access;
  if (input.instanceId !== snapshot.instanceId || input.reviewId !== snapshot.id)
    return { allowed: false, reason: "TARGET_MISMATCH" };
  if (!["publication", "profile", "contact", "change_request"].includes(snapshot.kind)) return { allowed: false, reason: "INVALID_KIND" };
  if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 1 || !/^[a-f0-9]{64}$/.test(snapshot.checksum))
    return { allowed: false, reason: "INVALID_SNAPSHOT" };
  if (snapshot.state !== "IN_REVIEW") return { allowed: false, reason: "NOT_IN_REVIEW" };
  if (input.expectedVersion !== snapshot.version || input.expectedChecksum !== snapshot.checksum)
    return { allowed: false, reason: "STALE_SNAPSHOT" };
  if (!principal || snapshot.contributors.includes(`${principal.issuer}:${principal.id}`))
    return { allowed: false, reason: "SELF_REVIEW" };
  if (context.authority !== "central") return { allowed: false, reason: "CENTRAL_REVIEW_DISABLED" };
  if (!context.connected) return { allowed: false, reason: "SOURCE_UNAVAILABLE" };
  if (!context.auditWritable) return { allowed: false, reason: "AUDIT_UNAVAILABLE" };
  if (input.reason.length > 2000) return { allowed: false, reason: "REASON_TOO_LONG" };
  if ((lifecycle || input.decision === "request_revision") && !input.reason.trim())
    return { allowed: false, reason: "REASON_REQUIRED" };
  return { allowed: true, next: "COMMAND_PENDING" };
}
