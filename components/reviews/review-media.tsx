"use client";
import Image from "next/image";
import { useState } from "react";
import { ImageOff, RefreshCw } from "lucide-react";
import { ReviewDialog } from "./review-dialog";
import { Button } from "@/components/ui/button";
import SetupEmptyState from "@/components/ui/empty-state";
type Media = { source_media_id: string; width: number; height: number; alt_text?: string | undefined };
export function ReviewMedia({ media, instanceId, reviewId }: { media: Media[]; instanceId: string; reviewId: string }) {
  const [selected,setSelected]=useState<Media | null>(null), [failed,setFailed]=useState<string[]>([]);
  const [originalFailed,setOriginalFailed]=useState(false), [attempt,setAttempt]=useState(0);
  const url=(m:Media)=>`/api/instances/${encodeURIComponent(instanceId)}/reviews/${encodeURIComponent(reviewId)}/media/${encodeURIComponent(m.source_media_id)}`;
  return <section className="sj-media"><h3>Media pengajuan</h3>{!media.length?<p className="sj-secondary">Tidak ada media pada snapshot ini.</p>:<div className="sj-media-grid">{media.map((m,i)=><Button variant="secondary" key={m.source_media_id} onClick={()=>{setOriginalFailed(false);setSelected(m);}} aria-label={`Buka media ${i+1}`}>
    {failed.includes(m.source_media_id)?<span><ImageOff aria-hidden="true"/>Media belum dapat dimuat</span>:<Image unoptimized src={url(m)+"?variant=thumbnail"} width={m.width} height={m.height} alt={m.alt_text||`Media pengajuan ${i+1}`} onError={()=>setFailed(v=>[...v,m.source_media_id])}/>}</Button>)}</div>}
    {selected?<ReviewDialog title="Media pengajuan" onClose={()=>setSelected(null)}>{originalFailed?<SetupEmptyState icon={ImageOff} variant="compact" title="Media belum dapat dimuat" description="Data pengajuan tetap tersedia." action={<Button variant="secondary" onClick={event=>{event.currentTarget.closest('dialog')?.querySelector<HTMLButtonElement>('button[aria-label="Tutup dialog"]')?.focus();setAttempt(v=>v+1);setOriginalFailed(false);}}><RefreshCw size={16} aria-hidden="true"/>Coba lagi</Button>}/>:<Image key={`${selected.source_media_id}:${attempt}`} unoptimized className="sj-media-full" src={url(selected)} alt={selected.alt_text||"Media pengajuan"} width={selected.width} height={selected.height} onError={()=>setOriginalFailed(true)}/>}</ReviewDialog>:null}
  </section>;
}
