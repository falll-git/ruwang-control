"use client";
import { Button } from "@/components/ui/button";
import { SETUP_PAGE_SEGMENTED_GROUP_CLASS, SETUP_PAGE_SEGMENTED_BUTTON_BASE_CLASS } from "@/components/ui/setup-page-styles";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Activity, RefreshCw } from "lucide-react";
import FeatureHeader from "@/components/ui/feature-header";
import { z } from "zod";
import { monitoringViewSchema, componentLabels, componentReason, sourceLabels, sourceFailure, sourceTimeDetails, type MonitoringView } from "@/src/domain/monitoring-read";
import { reviewDate } from "@/src/domain/review-ui";
import { readReviewResponse } from "./reviews/review-request";
import { ReviewList } from "./reviews/review-list";
import SetupEmptyState from "@/components/ui/empty-state";

export function MonitoringClient({initial,canInspect,initialError,canRecover=false,canReadReviews=true,canProcess=false}:{initial:MonitoringView|null;canInspect:boolean;initialError?:string;canRecover?:boolean;canReadReviews?:boolean;canProcess?:boolean}) {
  const search=useSearchParams(), services=!canReadReviews||search.get("view")==="services";
  const [view,setView]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(initialError||"");
  const pending=useRef<AbortController|null>(null),tabs=useRef<(HTMLButtonElement|null)[]>([]);
  useEffect(()=>()=>pending.current?.abort(),[]);
  async function refresh(inspect=false) {
    if(pending.current)return;
    const controller=new AbortController();pending.current=controller;setBusy(true);
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]);
    try {
      let token:string|undefined;
      if(inspect){
        const csrf=await readReviewResponse(await fetch("/api/auth/csrf",{cache:"no-store",signal}),z.object({token:z.string().min(1)}));token=csrf.token;
      }
      const response=await fetch("/api/monitoring",{cache:"no-store",signal,...(inspect?{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":token!},body:"{}"}:{})});
      const next=await readReviewResponse(response,monitoringViewSchema);
      if(!controller.signal.aborted){setView(next);setError("");}
    } catch(cause) {
      if(!controller.signal.aborted)setError(cause instanceof Error&&cause.name==="TimeoutError"?"Pembaruan melewati batas waktu. Hasil pemeriksaan belum dapat dipastikan.":"Pembaruan belum berhasil. Data terakhir tidak menggambarkan keadaan saat ini.");
    } finally {if(pending.current===controller)pending.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  function tab(index:number){const params=new URLSearchParams(search);if(index===1)params.set("view","services");else params.delete("view");window.history.pushState(null,"","/monitoring?"+params);}
  return <div className="sj-review sj-monitoring"><FeatureHeader title="Monitoring SJ" subtitle="Pantau penerapan keputusan dan kendala yang perlu ditindaklanjuti." icon={<Activity/>}/>
    {canRecover?<div className="sj-recovery-links" role="navigation" aria-label="Penanganan kendala">
      <Link className="sj-back" href="/monitoring/pengiriman">Periksa pengiriman bank</Link>
      {canProcess?<Link className="sj-back" href="/monitoring/pemrosesan">Periksa pemrosesan SJ</Link>:null}
    </div>:null}
    <div className={"sj-tabs sj-monitor-tabs " + SETUP_PAGE_SEGMENTED_GROUP_CLASS} role="tablist" aria-label="Pemantauan">{["Pengajuan","Layanan"].map((label,index)=>index===0&&!canReadReviews?null:<button className={SETUP_PAGE_SEGMENTED_BUTTON_BASE_CLASS} key={label} id={`monitor-tab-${index}`} ref={el=>{tabs.current[index]=el;}} role="tab" aria-selected={services===(index===1)} aria-controls="monitor-panel" tabIndex={services===(index===1)?0:-1} onClick={()=>tab(index)} onKeyDown={e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const next=!canReadReviews?1:e.key==="Home"?0:e.key==="End"?1:1-index;tab(next);tabs.current[next]?.focus();}}}>{label}</button>)}</div>
    <div id="monitor-panel" role="tabpanel" aria-labelledby={`monitor-tab-${services?1:0}`}>
    {!services?<ReviewList monitoring/>:<>
      <div className="sj-toolbar sj-monitor-toolbar"><p className="sj-secondary">Data dimuat: {reviewDate(view?.observedAt??null)}</p><Button variant="secondary" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16} aria-hidden="true"/>{busy?"Memuat…":"Refresh"}</Button>{canInspect&&view?.enabled?<Button variant="primary" className="sj-primary" disabled={busy} onClick={()=>void refresh(true)}>Periksa sumber</Button>:null}</div>
      {error?<p className="sj-context" role="alert">{error} {view?"Data di bawah adalah hasil sebelumnya.":"Belum ada data untuk ditampilkan."}</p>:null}
      {!canInspect?<p className="sj-context">Akses pemeriksaan sumber tidak tersedia untuk akun ini.</p>:view&&!view.enabled?<p className="sj-context">Pemeriksaan sumber belum diaktifkan.</p>:null}
      <p className="sj-secondary">Status layanan, bukan bukti aset tampil.</p>
      {!view?<SetupEmptyState title="Data layanan belum tersedia" description="Gunakan Refresh untuk mencoba kembali."/>:view.sources.length===0?<SetupEmptyState variant="panel" title="Belum ada sumber terdaftar"/>:<div className="sj-monitor-sources">{view.sources.map(source=><article className="sj-workbench sj-monitor-source" key={source.instanceId}>
        <header><div><p className="sj-secondary">{source.sourceKind==="sj_central"?"Seputar Jaminan":"Ruwang Arsip"}</p><h2>{source.displayName}</h2></div><p className="sj-secondary">{error?"Keadaan saat ini belum diketahui":sourceLabels[source.status]}</p></header>
        <dl className="sj-record">{sourceTimeDetails(source,reviewDate).map(detail=><div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}{detail.result?<small>{detail.result}</small>:null}</dd></div>)}</dl>
        {source.lastFailure?<p className="sj-context">Kegagalan terakhir · {reviewDate(source.lastFailure.at)}<br/>{sourceFailure(source.lastFailure.code)}</p>:null}
        <h3>Hasil layanan terakhir</h3>
        {!source.services.length&&!source.queues.length?<p>Rincian belum tersedia.</p>:<ul className="sj-source-parts">{[...source.services,...source.queues].map(part=><li key={part.key}><strong>{componentLabels[part.key]??part.key}</strong><span>{sourceLabels[part.status]}</span>{"depth" in part?<span>{typeof part.depth!=="number"?"Jumlah belum tersedia":`${part.depth.toLocaleString("id-ID")} menunggu / diproses`}</span>:null}{part.detailCode?<small>{componentReason(part.detailCode)}</small>:null}</li>)}</ul>}
      </article>)}</div>}
    </>}
    </div>
  </div>;
}
