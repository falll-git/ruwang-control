"use client";
import SetupPrimaryButton from "@/components/ui/primary-button";
import { Button } from "@/components/ui/button";
import { SETUP_PAGE_SEGMENTED_GROUP_CLASS, SETUP_PAGE_SEGMENTED_BUTTON_BASE_CLASS } from "@/components/ui/setup-page-styles";
import { SetupDataTable, SetupDataTableHead, SetupDataTableBody, SetupDataTableRow, SetupDataTableHeaderCell, SetupDataTableCell } from "@/components/ui/data-table";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ChevronLeft, ChevronRight, Eye, RefreshCw, ClipboardCheck, Search, SlidersHorizontal } from "lucide-react";
import SetupEmptyState from "@/components/ui/empty-state";
import FeatureHeader from "@/components/ui/feature-header";
import { StatusBadge } from "@/components/ui/badge";
import Pagination from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { reviewPageSchema, type ReviewPage } from "@/src/domain/review-read-contract";
import { reviewStates, lifecycleActions, commandStates } from "@/src/domain/review-read";
import { applicationLabel, applicationLabels, reviewApiQuery, reviewDate, reviewLabels, switchReviewGroup } from "@/src/domain/review-ui";
import { readReviewResponse } from "./review-request";
import { ReviewDialog } from "./review-dialog";
import { applicationNext } from "@/src/domain/monitoring-read";
import { reviewDecisionBadge } from "@/src/domain/review-presentation";

export function ReviewList({ monitoring = false }: { monitoring?: boolean }) {
  const basePath = monitoring ? "/monitoring" : "/reviews";
  const search = useSearchParams(), query = search.toString(), group = search.get("group") || "content";
  const [loaded, setLoaded] = useState<{ query: string; data: ReviewPage } | null>(null), [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0), [advanced, setAdvanced] = useState(false);
  const [settled,setSettled]=useState<{query:string;reload:number}|null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const data = loaded?.query === query ? loaded.data : null;
  const busy=!error&&(settled?.query!==query||settled?.reload!==reload);
  let trail:string[]=[];try{const value=JSON.parse(search.get('trail')||'[]');if(Array.isArray(value)&&value.every(v=>typeof v==='string'))trail=value.slice(-50);}catch{}
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const apiQuery=reviewApiQuery(query);if(!apiQuery.has("cursor")&&!apiQuery.has("page"))apiQuery.set("page","1");if(monitoring&&!apiQuery.has("state"))apiQuery.set("state","all");
    fetch("/api/reviews?" + apiQuery, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(r => readReviewResponse(r, reviewPageSchema)).then(data => { if (active) { setLoaded({ query, data }); setError(null); setSettled({query,reload}); } })
      .catch(cause => { if (active) { setSettled({query,reload}); setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "Pemeriksaan belum dapat dimuat. Coba lagi."); } });
    return () => { active = false; controller.abort(); };
  }, [query, reload, monitoring]);
  function navigate(params: URLSearchParams) { setError(null); window.history.pushState(null, "", basePath + "?" + params); }
  function filters(values: Record<string, string>) { const p = new URLSearchParams(query); for (const [k,v] of Object.entries(values)) {if(v)p.set(k,v);else p.delete(k);} p.delete("cursor"); p.delete("trail"); p.set("page","1"); navigate(p); }
  function reset() { const p = new URLSearchParams(); p.set("group", group); if (search.get("other")) p.set("other",search.get("other")!); navigate(p); }
  function page(number: number) { const p=new URLSearchParams(query);p.delete("cursor");p.delete("trail");p.set("page",String(number));navigate(p); }
  return <div className="sj-review">{!monitoring ? <FeatureHeader title="Pemeriksaan" subtitle="Periksa pengajuan bank dan beri keputusan." icon={<ClipboardCheck/>}/> : null}<section className="sj-workbench">
    <div className={"sj-tabs " + SETUP_PAGE_SEGMENTED_GROUP_CLASS} role="tablist" aria-label="Jenis pengajuan" data-segmented-tabs>{["content","lifecycle"].map((g,i) => <button className={SETUP_PAGE_SEGMENTED_BUTTON_BASE_CLASS} key={g} ref={el => { tabs.current[i] = el; }} id={`sj-${g}`} role="tab" aria-controls="sj-list" aria-selected={group === g} tabIndex={group === g ? 0 : -1} onClick={() => navigate(new URLSearchParams(switchReviewGroup(query,g as "content" | "lifecycle")))} onKeyDown={event => { if (["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) { event.preventDefault(); const n = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1-i; tabs.current[n]?.click(); tabs.current[n]?.focus(); } }}>{g === "content" ? "Pengajuan konten" : "Penarikan & perubahan"}</button>)}</div>
    <div id="sj-list" role="tabpanel" aria-labelledby={`sj-${group}`} aria-busy={busy}>
      <form key={query} className="sj-toolbar" onSubmit={event => { event.preventDefault(); filters(Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>); }}>
        <div className="sj-search"><Search size={18} aria-hidden="true"/><input name="q" defaultValue={search.get("q") || ""} maxLength={120} aria-label="Cari judul atau referensi" placeholder="Cari judul atau referensi"/><Button variant="secondary" aria-label="Cari pengajuan"><ArrowRight size={18} aria-hidden="true"/></Button></div>
        <select name="state" aria-label="Status pengajuan" defaultValue={search.get("state") || (monitoring ? "all" : "IN_REVIEW")} onChange={e => filters({state:e.target.value})}><option value="all">Semua status</option>{reviewStates.map(s => <option key={s} value={s}>{reviewLabels[s]}</option>)}</select>
        <Button variant="secondary" type="button" onClick={() => setAdvanced(true)}><SlidersHorizontal size={18} aria-hidden="true"/>Filter</Button><Button variant="secondary" type="button" disabled={busy} onClick={()=>{setError(null);setReload(v=>v+1);}}><RefreshCw size={16} className={busy?'control-spin':undefined} aria-hidden="true"/>Refresh</Button>
      </form>
      <div className="sj-filter-meta"><span>{data ? `${data.count.value} pengajuan sesuai filter & akses` : "Jumlah belum tersedia"} · {search.get("sort") === "submitted_desc" ? "Terbaru" : "Paling lama"}{search.get("kind") ? ` · ${reviewLabels[search.get("kind")!]}` : ""}{search.get("commandState") ? ` · ${applicationLabel(search.get("commandState"))}` : ""}{search.get("action") ? ` · ${reviewLabels[search.get("action")!]}` : ""}</span><Button variant="ghost" onClick={reset}>Reset</Button></div>
      {error&&data ? <p className="sj-context" role="alert">{error} Data sebelumnya tetap ditampilkan.</p> : null}
      {error&&!data ? <div className="sj-empty" role="alert"><h2>Pengajuan belum dapat dimuat</h2><p>{error}</p><Button variant="secondary" onClick={() => { setError(null); setReload(v => v+1); }}>Refresh</Button></div> : !data ? <div className="sj-list-loading" role="status">Memuat pengajuan…{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="sj-list-loading-row"/>)}</div> : !data.items.length ? <SetupEmptyState isFiltered title="Tidak ada pengajuan sesuai filter" description="Coba kata pencarian atau status lain." action={<Button variant="secondary" onClick={reset}>Reset filter</Button>}/> : <SetupDataTable className="control-data-table"><caption className="sr-only">Pengajuan pada tab aktif sesuai filter dan izin</caption><SetupDataTableHead><SetupDataTableRow><SetupDataTableHeaderCell>Pengajuan</SetupDataTableHeaderCell><SetupDataTableHeaderCell>Pemeriksaan</SetupDataTableHeaderCell><SetupDataTableHeaderCell>Penerapan bank</SetupDataTableHeaderCell><SetupDataTableHeaderCell><span className="sr-only">Aksi</span></SetupDataTableHeaderCell></SetupDataTableRow></SetupDataTableHead><SetupDataTableBody>{data.items.map(row => <SetupDataTableRow key={row.id}>
        <SetupDataTableCell><div className="control-row-title"><strong>{row.title}</strong><small>{row.instanceName}</small><small>{reviewLabels[row.action || row.kind]} · v{row.sourceVersion} · {reviewDate(row.submittedAt)}</small></div></SetupDataTableCell>
        <SetupDataTableCell><StatusBadge tone={reviewDecisionBadge(row).tone}>{reviewDecisionBadge(row).label}</StatusBadge>{row.latestReceivedVersion > row.sourceVersion ? <small>Versi baru tersedia</small> : null}</SetupDataTableCell>
        <SetupDataTableCell><span className="sj-secondary">{row.commandState ? applicationLabels[row.commandState] : "Belum ada keputusan"}</span>{monitoring ? <small>{applicationNext(row.commandState,row.commandResultCode,row.state)}</small> : null}</SetupDataTableCell>
        <SetupDataTableCell><Button asChild variant="secondary"><Link prefetch={false} href={`/reviews/${row.id}?returnTo=${encodeURIComponent(basePath+"?"+query)}`} aria-label={`Tinjau ${row.title}`}><Eye size={16} aria-hidden="true"/>Tinjau</Link></Button></SetupDataTableCell>
      </SetupDataTableRow>)}</SetupDataTableBody></SetupDataTable>}
      {data && data.page.number===null ? <nav className="control-pagination" aria-label="Halaman pengajuan"><span>{data.items.length} pengajuan pada halaman ini</span><div className="control-pagination-controls"><Button variant="secondary" aria-label="Halaman sebelumnya" disabled={!trail.length||busy} onClick={()=>{const p=new URLSearchParams(query),previous=trail.slice(0,-1),cursor=trail.at(-1);p.delete("page");if(cursor)p.set("cursor",cursor);else p.delete("cursor");p.set("trail",JSON.stringify(previous));navigate(p);}}><ChevronLeft size={16} aria-hidden="true"/></Button><Button variant="secondary" aria-label="Halaman berikutnya" disabled={!data.page.nextCursor||busy} onClick={()=>{const p=new URLSearchParams(query);p.delete("page");p.set("cursor",data.page.nextCursor!);p.set("trail",JSON.stringify([...trail,search.get("cursor")||""]));navigate(p);}}><ChevronRight size={16} aria-hidden="true"/></Button></div></nav> : null}
      {data && data.page.number !== null && data.page.lastPage !== null ? <Pagination page={data.page.number} lastPage={data.page.lastPage} total={data.count.value} limit={data.page.limit} isLoading={busy} onPageChange={page}/> : null}
    </div></section>
    {advanced ? <ReviewDialog title="Filter pemeriksaan" onClose={() => setAdvanced(false)}><form className="sj-fields" onSubmit={e => { e.preventDefault(); filters(Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>); setAdvanced(false); }}>
      {group === "content" ? <label>Jenis<select name="kind" defaultValue={search.get("kind") || ""}><option value="">Semua jenis</option>{["profile","contact","publication"].map(v => <option key={v} value={v}>{reviewLabels[v]}</option>)}</select></label> : <label>Permintaan<select name="action" defaultValue={search.get("action") || ""}><option value="">Semua permintaan</option>{lifecycleActions.map(v => <option key={v} value={v}>{reviewLabels[v]}</option>)}</select></label>}
      <label>Penerapan keputusan<select name="commandState" defaultValue={search.get("commandState") || ""}><option value="">Semua</option><option value="none">Belum ada keputusan</option>{commandStates.map(v => <option key={v} value={v}>{applicationLabels[v]}</option>)}</select></label>
      <label>Urutan<select name="sort" defaultValue={search.get("sort") || "submitted_asc"}><option value="submitted_asc">Paling lama</option><option value="submitted_desc">Terbaru</option></select></label>
      <label>Pengajuan per halaman<select name="limit" defaultValue={search.get("limit") || "25"}>{[10,25,50].map(v => <option key={v}>{v}</option>)}</select></label>
      <div className="sj-actions"><Button variant="secondary" type="button" onClick={() => setAdvanced(false)}>Batal</Button><SetupPrimaryButton type="submit">Terapkan filter</SetupPrimaryButton></div>
    </form></ReviewDialog> : null}
  </div>;
}

