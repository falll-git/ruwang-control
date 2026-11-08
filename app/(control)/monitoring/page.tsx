import { redirect } from "next/navigation";
import { MonitoringClient } from "@/components/monitoring-client";
import { getCurrentOperatorSession } from "@/src/server/auth/current-session";
import { getMonitoringView } from "@/src/server/monitoring";
import { authorize } from "@/src/domain/authorization";
import { monitoringViewSchema } from "@/src/domain/monitoring-read";
import {getRuntimeConfig} from '@/src/lib/env';
import "@/app/reviews/review.css";
import "@/app/monitoring/monitoring.css";

export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  const session = await getCurrentOperatorSession();
  if (!session) redirect("/login");
  let initial = null;
  let initialError = "";
  try { initial = monitoringViewSchema.parse(await getMonitoringView(session.principal)); }
  catch { initialError = "Data layanan belum dapat dimuat."; }
  const canInspect = session.principal.grants.some(grant => authorize(session.principal,"monitoring.read",grant.instanceId).allowed);
  return <>
    <MonitoringClient initial={initial} initialError={initialError} canInspect={canInspect} canProcess={getRuntimeConfig().CONTROL_ENABLE_SJ_RECOVERY} canRecover={session.principal.grants.some(grant=>authorize(session.principal,'delivery.read',grant.instanceId).allowed)} canReadReviews={session.principal.grants.some(grant=>authorize(session.principal,'review.read',grant.instanceId).allowed)}/>
  </>;
}
