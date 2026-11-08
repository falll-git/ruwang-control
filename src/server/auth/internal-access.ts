import type { Principal, Role } from "@/src/domain/authorization";
import type { DatabaseClient } from "@/src/server/database";

// Scope is projected from the actual registry, never from browser-supplied grants.
export async function registeredInternalScopes(client: DatabaseClient, operatorId: string): Promise<Principal["grants"]> {
  const result = await client.query<{ instance_id: string; role: Role }>(`
    SELECT i.id::text AS instance_id, o.access_role AS role
    FROM control.instances i CROSS JOIN control.operators o
    WHERE o.id = $1 AND o.status = 'active' AND o.access_role = 'internal_operator'
    ORDER BY i.id`, [operatorId]);
  return result.rows.map(row => ({ instanceId: row.instance_id, role: row.role, active: true }));
}
