"use client";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Check, RotateCcw, X } from "lucide-react";
import type { ReviewDetailResponse } from "@/src/domain/review-read-contract";
import { applicationLabels, commandIntentSchema, commandLookupSchema, decisionLabels, decisionReceiptSchema } from "@/src/domain/review-ui";
import { ReviewDialog } from "./reviews/review-dialog";
import { readReviewResponse, ReviewRequestError } from "./reviews/review-request";

type Decision = keyof typeof decisionLabels;
export function ReviewDecisionForm({ review, operatorKey, onRefresh }: { review: ReviewDetailResponse; operatorKey: string; onRefresh: () => Promise<boolean> }) {
  const [note,setNote] = useState(""), [confirm,setConfirm] = useState<Decision | null>(null), [busy,setBusy] = useState(false);
  const [error,setError] = useState(""), [outcome,setOutcome] = useState(""), [unresolved,setUnresolved] = useState<string | null>(null), [blocked,setBlocked] = useState(false);
  const lock=useRef(false), field=useRef<HTMLTextAreaElement>(null);
  const retryId=useRef<string | null>(null);
  const resultMessage=useRef<HTMLDivElement>(null);
  const storageKey = `control-review-pending:${operatorKey}:${review.instanceId}:${review.id}`;
  useEffect(() => {
    if (!busy && !confirm && (error || outcome) && document.activeElement !== field.current) {
      resultMessage.current?.focus();
    }
  }, [busy, confirm, error, outcome]);
  useEffect(() => { let active=true; Promise.resolve().then(() => { if(!active)return; try { const id=sessionStorage.getItem(storageKey); if(id&&z.string().uuid().safeParse(id).success) { setUnresolved(id); setError("Keputusan sebelumnya belum terkonfirmasi. Periksa status."); } } catch { /* Server idempotency remains authoritative. */ } }); return()=>{active=false}; },[storageKey]);
  function ask(decision: Decision) {
    if(lock.current || unresolved || blocked) return;
    const action=review.actions.find(a=>a.action===decision);
    if(!action?.allowed)return;
    if(action.requiresReason&&!note.trim()){setError("Isi catatan untuk keputusan ini.");field.current?.focus();return}
    setError("");setConfirm(decision);
  }
  async function submit() {
    if(lock.current||!confirm)return;
    lock.current=true;setBusy(true);setError("");
    let commandId:string | null=null;
    try {
      const csrf=await readReviewResponse(await fetch("/api/auth/csrf",{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(10000)}),z.object({token:z.string().min(1)}));
      commandId=retryId.current ?? crypto.randomUUID();
      // Persist only the command identity, never notes, media, tokens or snapshot content.
      try { sessionStorage.setItem(storageKey,commandId); } catch { /* Current view still blocks retries. */ }
      setUnresolved(commandId);
      const response=await fetch(`/api/instances/${review.instanceId}/reviews/${review.id}/decisions`,{method:"POST",credentials:"same-origin",signal:AbortSignal.timeout(15000),
        headers:{"content-type":"application/json","x-csrf-token":csrf.token,"idempotency-key":commandId},
        body:JSON.stringify({decision:confirm,reason:note.trim(),expectedVersion:review.sourceVersion,expectedChecksum:review.checksum})});
      const receipt=await readReviewResponse(response,decisionReceiptSchema);
      if(receipt.commandId!==commandId) {
        // The server may return an earlier command for the same actor and intent (two tabs).
        const prior=await readReviewResponse(await fetch(`/api/instances/${review.instanceId}/review-commands/${receipt.commandId}`,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(15000)}),commandIntentSchema);
        if(prior.id!==receipt.commandId||prior.instance_id!==review.instanceId||prior.snapshot_id!==review.id||prior.request_payload.decision!==confirm||prior.request_payload.expected_version!==review.sourceVersion||prior.request_payload.expected_checksum!==review.checksum||(prior.decision_note??prior.request_payload.reason??"")!==note.trim())throw new Error("Identitas hasil tidak sesuai.");
      }
      retryId.current=null;setOutcome(applicationLabels[receipt.state]);setBlocked(true);setUnresolved(null);try{sessionStorage.removeItem(storageKey)}catch{}
      setConfirm(null);await onRefresh();
    } catch(cause) {
      setConfirm(null);
      if(commandId) {
        setBlocked(true);
        if(cause instanceof ReviewRequestError && [400,401,403,409].includes(cause.status) && cause.code!=="INVALID_RESPONSE") {
          retryId.current=null;setError(cause.message);setUnresolved(null);try{sessionStorage.removeItem(storageKey)}catch{}
          // The API rejected enqueueing. Re-read eligibility; never automatically repeat a decision.
          if(await onRefresh())setBlocked(false);
        } else setError("Keputusan belum terkonfirmasi. Periksa status sebelum melanjutkan.");
      } else setError("Keamanan sesi belum dapat diperiksa. Tidak ada keputusan dikirim; coba lagi.");
    } finally { lock.current=false;setBusy(false); }
  }
  async function check() {
    if(lock.current||!unresolved)return;lock.current=true;setBusy(true);
    try {
      const command=await readReviewResponse(await fetch(`/api/instances/${review.instanceId}/review-commands/${unresolved}`,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(15000)}),commandLookupSchema);
      if(command.id!==unresolved||command.instance_id!==review.instanceId||command.snapshot_id!==review.id)throw Error("Mismatch");
      retryId.current=null;setOutcome(applicationLabels[command.state]);setError("");setUnresolved(null);setBlocked(true);try{sessionStorage.removeItem(storageKey)}catch{}
      await onRefresh();
    } catch (cause) {
      // Only an authenticated, scoped absence from Control unlocks a retry.
      // Keep the SAME id: a delayed first POST must not create another intent.
      // The bank reporting absence is a different contract and remains UNKNOWN.
      if (cause instanceof ReviewRequestError && cause.status===404 && cause.code==="COMMAND_NOT_FOUND" && await onRefresh()) {
        retryId.current=unresolved;setUnresolved(null);setBlocked(false);setOutcome("");
        setError("Keputusan belum tercatat di Control. Periksa catatan, lalu konfirmasi kembali jika ingin mengirim.");
      } else setError("Hasil belum dapat dipastikan. Tidak ada keputusan baru dikirim.");
    }
    finally {lock.current=false;setBusy(false)}
  }
  async function checkBankResult() {
    if(lock.current || !review.commandId || !review.resultCheck?.allowed)return;
    lock.current=true;setBusy(true);
    try {
      const csrf=await readReviewResponse(await fetch("/api/auth/csrf",{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(10000)}),z.object({token:z.string().min(1)}));
      const result=await readReviewResponse(await fetch(`/api/instances/${review.instanceId}/review-commands/${review.commandId}`,{
        method:"POST",credentials:"same-origin",signal:AbortSignal.timeout(15000),headers:{"content-type":"application/json","x-csrf-token":csrf.token},
        body:JSON.stringify({action:"check_result"})}),z.object({state:z.enum(["PENDING","DISPATCHING","APPLIED","REJECTED","UNKNOWN"]),resultCode:z.string().nullable()}).strict());
      setError("");setOutcome(result.state==="UNKNOWN"?"Hasil belum tercatat di bank. Tidak ada keputusan baru dikirim":applicationLabels[result.state]);
      await onRefresh();
    } catch {setError("Hasil bank belum bisa diperiksa. Tidak ada keputusan baru dikirim.");}
    finally {lock.current=false;setBusy(false);}
  }
  return <section className="sj-decision" aria-labelledby="decision-title"><h2 id="decision-title">Keputusan pemeriksaan</h2><p className="sj-secondary">Berlaku untuk pengajuan versi {review.sourceVersion}</p>
    {review.decision ? <><strong>{review.decision.action==="approve"?"Disetujui":review.decision.action==="request_revision"?"Perlu diperbaiki":"Ditolak"}</strong><p className="sj-note">{review.decision.note || "Tanpa catatan"}</p><p>{applicationLabels[review.decision.applicationState]}</p></> : <>
      {!review.actions.length ? <p>Tidak ada tindakan keputusan yang tersedia untuk pengajuan ini.</p> : <><label htmlFor="review-note">Catatan pemeriksa</label>
      <textarea ref={field} id="review-note" rows={5} maxLength={2000} disabled={busy||Boolean(unresolved)||blocked} value={note} onChange={e=>setNote(e.target.value)} aria-describedby="review-note-help review-decision-error" aria-invalid={!!error&&!note.trim()} placeholder="Apa yang perlu ditindaklanjuti bank?"/>
      <p id="review-note-help" className="sj-secondary">{review.kind==="change_request"?"Wajib untuk setiap keputusan.":"Wajib jika meminta revisi."} Maks. 2.000 karakter.</p>
      <div className="sj-decision-actions">{review.actions.map(action=><div key={action.action}><Button variant={action.action==="approve"?"primary":"secondary"} disabled={!action.allowed||busy||!!unresolved||blocked} onClick={()=>ask(action.action)}>{action.action==="approve"?<Check size={18}/>:action.action==="request_revision"?<RotateCcw size={18}/>:<X size={18}/>} {decisionLabels[action.action]}</Button>{!action.allowed?<p className="sj-secondary">{action.reason}</p>:null}</div>)}</div></>}
    </>}
    <div ref={resultMessage} tabIndex={-1}>
      <p id="review-decision-error" className="sj-error" role={error?"alert":undefined}>{error}</p>
      {outcome?<p role="status">{outcome}. Ini bukan bukti tampil di SJ.</p>:null}
    </div>
    {unresolved?<Button variant="secondary" disabled={busy} onClick={check}>{busy?"Memeriksa…":"Periksa status keputusan"}</Button>:null}
    {review.resultCheck?<div><Button variant="secondary" disabled={busy||!review.resultCheck.allowed} onClick={checkBankResult}>{busy?"Memeriksa…":"Periksa hasil di bank"}</Button><p className="sj-secondary">{review.resultCheck.reason||"Memeriksa hasil keputusan, tanpa mengirim ulang."}</p></div>:null}
    {blocked&&!unresolved&&!outcome&&!review.decision?<Button variant="secondary" disabled={busy} onClick={async()=>{if(await onRefresh())setBlocked(false)}}>Perbarui izin dan pengajuan</Button>:null}
    {confirm?<ReviewDialog title={decisionLabels[confirm]+"?"} busy={busy} onClose={()=>setConfirm(null)} footer={<><Button variant="secondary" data-initial-focus disabled={busy} onClick={()=>setConfirm(null)}>Batal</Button><Button variant="primary" className="sj-primary" disabled={busy} onClick={submit}>{busy?"Menyimpan…":decisionLabels[confirm]}</Button></>}>
      <div className="sj-subject"><strong>{review.title}</strong><p>{review.instanceName} · Pengajuan versi {review.sourceVersion}</p></div>
      <p>{review.kind==="change_request"?"Keputusan ini berlaku untuk permintaan bank di atas.":"Keputusan dicatat dan dikirim ke bank. Persetujuan belum membuktikan data tampil di SJ."}{review.detail.kind==="change_request"&&review.detail.action==="ARCHIVE_PUBLICATION"?" Arsip tidak menghapus data secara permanen.":""}</p>
      <p className="sj-note">{note.trim()||"Tanpa catatan"}</p>
    </ReviewDialog>:null}
  </section>;
}
