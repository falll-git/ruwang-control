import { ArrowRight, CircleAlert, ClipboardCheck, Activity, LayoutDashboard } from "lucide-react";
import FeatureHeader from "@/components/ui/feature-header";
import { getDashboardSnapshot, type DashboardSnapshot } from "@/src/server/dashboard";
import { toPublicError } from "@/src/server/errors";
import { getCurrentOperatorSession } from "@/src/server/auth/current-session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authorize } from "@/src/domain/authorization";
import { reviewDate } from "@/src/domain/review-ui";

export const dynamic = "force-dynamic";
type DashboardState = { ready: true; snapshot: DashboardSnapshot } | { ready: false; code: string; message: string };
async function loadDashboard(principal: Parameters<typeof getDashboardSnapshot>[0]): Promise<DashboardState> {
  try { return { ready: true, snapshot: await getDashboardSnapshot(principal) }; }
  catch (error) { const result = toPublicError(error); return { ready: false, code: result.code, message: result.message }; }
}
export default async function DashboardPage() {
  const session = await getCurrentOperatorSession();
  if (!session) redirect("/login");
  const state = await loadDashboard(session.principal);
  const canReadReviews = session.principal.grants.some(g => authorize(session.principal, "review.read", g.instanceId).allowed);
  return <>
    <FeatureHeader title="Dashboard" subtitle="Pekerjaan Seputar Jaminan." icon={<LayoutDashboard/>}/>
    {!state.ready ? <section className="notice notice-error" aria-labelledby="setup-title"><CircleAlert aria-hidden="true" size={22}/><div><h2 id="setup-title">Data belum dapat dimuat</h2><p>{state.message}</p><code>{state.code}</code></div></section>
      : <><p className="sj-secondary">Data dimuat {reviewDate(state.snapshot.observedAt)} · {state.snapshot.counts.instances} instansi dalam akses Anda</p>
        {canReadReviews ? <div className="control-work-links">
          <Link className="control-work-card" href="/reviews?group=content&state=IN_REVIEW" prefetch={false}>
            <h2><ClipboardCheck size={22} aria-hidden="true"/>Pengajuan konten</h2>
            <p className="control-work-count"><strong>{state.snapshot.counts.pendingContent.toLocaleString("id-ID")}</strong>menunggu pemeriksaan</p>
            <span>Buka pemeriksaan<ArrowRight size={18} aria-hidden="true"/></span>
          </Link>
          <Link className="control-work-card" href="/reviews?group=lifecycle&state=IN_REVIEW" prefetch={false}>
            <h2><ClipboardCheck size={22} aria-hidden="true"/>Penarikan & perubahan</h2>
            <p className="control-work-count"><strong>{state.snapshot.counts.pendingLifecycle.toLocaleString("id-ID")}</strong>menunggu pemeriksaan</p>
            <span>Buka permintaan<ArrowRight size={18} aria-hidden="true"/></span>
          </Link>
          <Link className="control-work-card" href="/monitoring" prefetch={false}>
            <h2><Activity size={22} aria-hidden="true"/>Penerapan keputusan</h2>
            <p className="control-work-count"><strong>{state.snapshot.counts.pendingCommands.toLocaleString("id-ID")}</strong>belum selesai</p>
            <span>Buka monitoring<ArrowRight size={18} aria-hidden="true"/></span>
          </Link>
        </div> : <p>Akses pemeriksaan tidak tersedia.</p>}
      </>}
  </>;
}
