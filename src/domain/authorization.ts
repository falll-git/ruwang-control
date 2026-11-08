/** Pure policy kernel. Call only with server-verified identity and registry-projected internal scopes. */
export const actions = [
  "review.read", "review.approve", "review.request_revision",
  "instance.read", "monitoring.read", "audit.read", "bank_account.read", "bank_account.manage",
  "operator.read", "operator.manage", "session.revoke",
  "delivery.read", "delivery.retry",
] as const;
export type Action = typeof actions[number];
export type Role = "internal_operator";
export const roleActions: Readonly<Record<Role, readonly Action[]>> = {
  internal_operator: actions,
};
export interface Principal {
  id: string;
  issuer: "ruwang-control";
  active: boolean;
  sessionVerified: boolean;
  grants: readonly { instanceId: string; role: Role; active: boolean }[];
}
export type Authorization = { allowed: true } | {
  allowed: false;
  reason: "UNAUTHENTICATED" | "FORBIDDEN";
};
export function authorize(principal: Principal | null, action: string, instanceId: string): Authorization {
  if (!principal || !principal.id || principal.issuer !== "ruwang-control" ||
      !principal.active || !principal.sessionVerified) {
    return { allowed: false, reason: "UNAUTHENTICATED" };
  }
  if (!instanceId || !actions.includes(action as Action)) return { allowed: false, reason: "FORBIDDEN" };
  const granted = principal.grants.some(grant => grant.active && grant.instanceId === instanceId &&
    Object.hasOwn(roleActions, grant.role) && roleActions[grant.role].includes(action as Action));
  return granted ? { allowed: true } : { allowed: false, reason: "FORBIDDEN" };
}
