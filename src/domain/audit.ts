export const auditActions = ["review.decision_requested", "review.decision_applied", "review.decision_rejected", "review.access_denied"] as const;
export const auditReasons = ["NONE", "REVISION_REQUIRED", "PERMISSION_DENIED", "VERSION_CONFLICT", "SOURCE_UNAVAILABLE", "SOURCE_REJECTED"] as const;
export interface AuditInput {
  eventId: string;
  requestId: string;
  actorId: string;
  instanceId: string;
  resourceId: string;
  action: typeof auditActions[number];
  reasonCode: typeof auditReasons[number];
  outcome: "requested" | "applied" | "rejected" | "denied";
  version: number;
  occurredAt: string;
}

/** Allowlist projection. No free-form request, headers, tokens, contacts, or payload copies. */
export function createAuditMetadata(input: AuditInput): Readonly<AuditInput & { schemaVersion: 1 }> {
  const ids = [input.eventId, input.requestId, input.actorId, input.instanceId, input.resourceId];
  if (ids.some(id => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) throw new Error("INVALID_AUDIT_ID");
  if (!auditActions.includes(input.action) || !auditReasons.includes(input.reasonCode)) throw new Error("INVALID_AUDIT_ENUM");
  const expectedOutcome = {
    "review.decision_requested": "requested", "review.decision_applied": "applied",
    "review.decision_rejected": "rejected", "review.access_denied": "denied",
  } as const;
  if (expectedOutcome[input.action] !== input.outcome) throw new Error("INVALID_AUDIT_OUTCOME");
  if (!Number.isSafeInteger(input.version) || input.version < 1) throw new Error("INVALID_AUDIT_VERSION");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.occurredAt) ||
      !Number.isFinite(Date.parse(input.occurredAt)) || new Date(input.occurredAt).toISOString() !== input.occurredAt)
    throw new Error("INVALID_AUDIT_TIME");
  return Object.freeze({
    schemaVersion: 1, eventId: input.eventId, requestId: input.requestId,
    actorId: input.actorId, instanceId: input.instanceId, resourceId: input.resourceId,
    action: input.action, reasonCode: input.reasonCode, outcome: input.outcome,
    version: input.version, occurredAt: input.occurredAt,
  });
}
