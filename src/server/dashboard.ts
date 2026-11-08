import { checkDatabaseReadiness, query } from "@/src/server/database";
import { authorize, type Action, type Principal } from "@/src/domain/authorization";

export type DashboardSnapshot = {
  source: "control_database";
  observedAt: string;
  counts: { instances: number; pendingReviews: number; pendingContent: number; pendingLifecycle: number; pendingCommands: number; staleServices: number };
};

export async function getDashboardSnapshot(principal: Principal): Promise<DashboardSnapshot> {
  await checkDatabaseReadiness();
  const ids = [...new Set(principal.grants.map(grant => grant.instanceId))];
  const scope = (action: Action) => ids.filter(id => authorize(principal, action, id).allowed);
  const instanceIds = scope("instance.read"), reviewIds = scope("review.read"), monitoringIds = scope("monitoring.read");
  const rows = await query<{ instances: string; pending_reviews: string; pending_content: string; pending_lifecycle: string; pending_commands: string; stale_services: string }>(`
    SELECT
      (SELECT count(*)::text FROM control.instances WHERE id = ANY($1::uuid[])) AS instances,
      (SELECT count(*)::text FROM control.review_snapshots s WHERE s.instance_id = ANY($2::uuid[]) AND s.state = 'IN_REVIEW' AND s.envelope_json IS NOT NULL AND NOT EXISTS (SELECT 1 FROM control.review_commands c WHERE c.snapshot_id=s.id AND c.instance_id=s.instance_id)) AS pending_reviews,
      (SELECT count(*)::text FROM control.review_snapshots s WHERE s.instance_id = ANY($2::uuid[]) AND s.state = 'IN_REVIEW' AND s.envelope_json IS NOT NULL AND s.resource_kind <> 'change_request' AND NOT EXISTS (SELECT 1 FROM control.review_commands c WHERE c.snapshot_id=s.id AND c.instance_id=s.instance_id)) AS pending_content,
      (SELECT count(*)::text FROM control.review_snapshots s WHERE s.instance_id = ANY($2::uuid[]) AND s.state = 'IN_REVIEW' AND s.envelope_json IS NOT NULL AND s.resource_kind = 'change_request' AND NOT EXISTS (SELECT 1 FROM control.review_commands c WHERE c.snapshot_id=s.id AND c.instance_id=s.instance_id)) AS pending_lifecycle,
      (SELECT count(*)::text FROM control.review_commands WHERE instance_id = ANY($2::uuid[]) AND state IN ('PENDING', 'DISPATCHING', 'UNKNOWN')) AS pending_commands,
      (SELECT count(*)::text FROM control.service_observations WHERE instance_id = ANY($3::uuid[]) AND observed_at < now() - interval '5 minutes') AS stale_services
  `, [instanceIds, reviewIds, monitoringIds]);
  const row = rows[0];
  if (!row) throw new Error("DASHBOARD_QUERY_EMPTY");
  return {
    source: "control_database",
    observedAt: new Date().toISOString(),
    counts: {
      instances: Number(row.instances),
      pendingReviews: Number(row.pending_reviews),
      pendingContent: Number(row.pending_content), pendingLifecycle: Number(row.pending_lifecycle),
      pendingCommands: Number(row.pending_commands),
      staleServices: Number(row.stale_services),
    },
  };
}
