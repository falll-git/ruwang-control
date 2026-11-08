"use client";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SetupDataTable, SetupDataTableHead, SetupDataTableBody, SetupDataTableRow, SetupDataTableHeaderCell, SetupDataTableCell } from "@/components/ui/data-table";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {z} from 'zod';
import {RefreshCw,ArrowLeft,ChevronLeft,ChevronRight,Send,Settings2,Eye} from 'lucide-react';
import SetupEmptyState from '@/components/ui/empty-state';
import FeatureHeader from '@/components/ui/feature-header';
import {deliveryStates,processingStates,deliveryLabels,deliverySubject,recoveryBlockLabel,recoveryViewSchema,type RecoveryJob,type RecoveryView,type RecoveryInput,type RecoveryProvider} from '@/src/domain/delivery-recovery';
import {cursorTrail,reviewDate} from '@/src/domain/review-ui';
import {ReviewDialog} from './reviews/review-dialog';

class RecoveryError extends Error { constructor(message:string,readonly code:string){super(message);} }
async function request(instanceId:string,input:RecoveryInput,signal:AbortSignal,provider:RecoveryProvider) {
  const topic=provider==='SJ'?'pemrosesan':'pengiriman';
  const csrf=await fetch('/api/auth/csrf',{cache:'no-store',signal});
  const csrfBody=z.object({data:z.object({token:z.string().min(1)})}).safeParse(await csrf.json());
  if(!csrf.ok||!csrfBody.success)throw new RecoveryError('Sesi berakhir. Masuk kembali untuk melanjutkan.','SESSION_EXPIRED');
  const token=csrfBody.data.data.token;
  const response=await fetch(`/api/instances/${instanceId}/${provider==='SJ'?'processing':'delivery'}-recovery`,{method:'POST',cache:'no-store',signal,
    headers:{'content-type':'application/json','x-csrf-token':token},body:JSON.stringify(input)});
  const body=await response.json();
  if(!response.ok){
    const code=body?.error?.code;
    const errors:Record<string,string>={FORBIDDEN:`Akses ${topic} tidak tersedia untuk akun ini.`,SESSION_EXPIRED:'Sesi berakhir. Masuk kembali untuk melanjutkan.',
      RECOVERY_JOB_CHANGED:`Data atau syarat ${topic} berubah. Refresh rincian.`,RECOVERY_TARGET_CHANGED:`Tujuan ${topic} berubah. Tindakan dihentikan.`,
      RECOVERY_RESULT_PENDING:'Ada permintaan yang hasilnya belum pasti. Periksa hasil permintaan tersebut terlebih dahulu.',
      RECOVERY_NOT_CONFIGURED:`Pemulihan ${topic} belum diaktifkan untuk bank ini.`};
    throw new RecoveryError(errors[code]??'Hasil belum dapat diperiksa. Coba Refresh.',code??'UNKNOWN');
  }
  const result=recoveryViewSchema.safeParse(body.data);
  if(!result.success)throw new RecoveryError(`Data ${topic} belum lengkap atau tidak dapat diverifikasi.`,'RECOVERY_RESPONSE_INVALID');
  return result.data;
}
type Props={instances:{id:string;name:string}[];initialError?:string;provider?:RecoveryProvider};
export function DeliveryRecoveryClient({instances,initialError='',provider='BANK'}:Props) {
  const processing=provider==='SJ',states=processing?processingStates:deliveryStates;
  const search=useSearchParams(),instanceId=search.get('bank')??instances[0]?.id??'',state=search.get('status')??'',cursor=search.get('cursor');
  const valid=instances.some(i=>i.id===instanceId)&&(!state||states.some(s=>s===state))&&(!cursor||z.string().uuid().safeParse(cursor).success);
  const [view,setView]=useState<RecoveryView|null>(null),[viewKey,setViewKey]=useState(''),[settled,setSettled]=useState(''),[error,setError]=useState(initialError),[reload,setReload]=useState(0),[selected,setSelected]=useState<string|null>(null);
  const key=JSON.stringify([instanceId,state,cursor]),sequence=useRef(0);
  const loadKey=JSON.stringify([key,reload]),busy=valid&&settled!==loadKey;
  useEffect(()=>{
    const seq=++sequence.current,controller=new AbortController();if(!valid)return()=>controller.abort();
    void request(instanceId,{action:'list',cursor,state:(state||null) as RecoveryJob['state']|null},AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),provider)
      .then(value=>{if(seq===sequence.current&&!controller.signal.aborted){setView(value);setViewKey(key);setError('');}})
      .catch(cause=>{if(!controller.signal.aborted&&seq===sequence.current)setError(cause instanceof RecoveryError?cause.message:'Pemuatan belum berhasil. Periksa koneksi lalu coba lagi.');})
      .finally(()=>{if(!controller.signal.aborted&&seq===sequence.current)setSettled(loadKey);});
    return()=>controller.abort();
  },[instanceId,state,cursor,key,valid,loadKey,provider]);
  const shown=viewKey===key&&view?.value.kind==='list'?view:null;
  const trail=cursorTrail(search.get("trail")).filter(value=>value===""||z.string().uuid().safeParse(value).success);
  const path=processing?'/monitoring/pemrosesan':'/monitoring/pengiriman';
  function navigate(patch:Record<string,string|null>){setError('');const params=new URLSearchParams(search);for(const [name,value]of Object.entries(patch)){if(value)params.set(name,value);else params.delete(name);}window.history.pushState(null,'',path+'?'+params);}
  return <div className="sj-review sj-recovery"><Link className="sj-back" href="/monitoring"><ArrowLeft size={16} aria-hidden="true"/>Kembali ke monitoring</Link>
    <FeatureHeader title={processing?'Pemrosesan SJ':'Pengiriman bank'} subtitle={processing?'Periksa dan tangani pekerjaan media atau publikasi.':'Periksa dan tangani pengiriman dari bank.'} icon={processing?<Settings2/>:<Send/>}/>
    {!instances.length?<p className="sj-context" role={initialError?'alert':undefined}>{initialError||`Belum ada bank yang siap untuk pemulihan ${processing?'pemrosesan':'pengiriman'}.`}</p>:<section className="sj-workbench" aria-label={processing?'Daftar pemrosesan':'Daftar pengiriman'}>
      <div className="sj-toolbar"><label>Bank<select value={instanceId} onChange={e=>navigate({bank:e.target.value,cursor:null,trail:null})}>{instances.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
        <label>Status<select value={state} onChange={e=>navigate({status:e.target.value,cursor:null,trail:null})}><option value="">Semua status</option>{states.map(s=><option value={s} key={s}>{deliveryLabels[s]}</option>)}</select></label>
        <Button variant="secondary" disabled={busy||!valid} onClick={()=>setReload(n=>n+1)}><RefreshCw size={16} aria-hidden="true"/>{busy?'Memuat…':'Refresh'}</Button></div>
      {!valid?<p className="sj-context" role="alert">Filter atau bank pada alamat ini tidak tersedia. <Link href={path}>Buka daftar awal</Link></p>:null}
      {error&&!busy?<p className="sj-context" role="alert">{error}{shown?' Data di bawah adalah hasil sebelumnya.':''}</p>:null}
      <p className="sj-filter-meta">{shown?`Diperiksa ${reviewDate(shown.checkedAt)} · ${shown.value.kind==='list'?shown.value.items.length:0} pada halaman ini`:'Belum ada hasil pemeriksaan.'}</p>
      {busy&&!shown?<p className="sj-empty" role="status">{processing?'Memuat pemrosesan…':'Memuat pengiriman…'}</p>:shown?.value.kind==='list'&&shown.value.items.length?<SetupDataTable className="control-data-table"><SetupDataTableHead><SetupDataTableRow><SetupDataTableHeaderCell>Data</SetupDataTableHeaderCell><SetupDataTableHeaderCell>{processing?'Status pemrosesan':'Status pengiriman'}</SetupDataTableHeaderCell><SetupDataTableHeaderCell>Dibuat</SetupDataTableHeaderCell><SetupDataTableHeaderCell>Aksi</SetupDataTableHeaderCell></SetupDataTableRow></SetupDataTableHead><SetupDataTableBody>{shown.value.items.map(j=><SetupDataTableRow key={j.id}><SetupDataTableCell><strong>{deliverySubject(j)}</strong></SetupDataTableCell><SetupDataTableCell><StatusBadge tone={['FAILED','QUARANTINED','DEAD_LETTER'].includes(j.state)?'danger':'neutral'}>{deliveryLabels[j.state]}</StatusBadge><small>{j.attempt_count} percobaan</small></SetupDataTableCell><SetupDataTableCell>{reviewDate(j.created_at)}</SetupDataTableCell><SetupDataTableCell><Button variant="secondary" disabled={busy} onClick={()=>setSelected(j.id)} aria-label={`Periksa ${deliverySubject(j)} ${'aggregate_id' in j?j.aggregate_id:j.id}`}><Eye aria-hidden="true" size={16}/>Periksa</Button></SetupDataTableCell></SetupDataTableRow>)}</SetupDataTableBody></SetupDataTable>:!busy&&shown?<SetupEmptyState isFiltered title={`Tidak ada ${processing?'pekerjaan':'pengiriman'} sesuai filter`}/>:null}
      <nav className="control-pagination" aria-label="Pagination"><p>{shown?.value.kind==='list'?shown.value.items.length:0} data pada halaman ini</p><ul>
        <li><Button variant="secondary" aria-label="Halaman sebelumnya" disabled={busy||!cursor} onClick={()=>{const previous=[...trail],value=previous.pop();navigate({cursor:value||null,trail:JSON.stringify(previous)});}}><ChevronLeft size={16} aria-hidden="true"/></Button></li>
        <li><Button variant="secondary" aria-label="Halaman berikutnya" disabled={busy||shown?.value.kind!=='list'||!shown.value.next_cursor} onClick={()=>{if(shown?.value.kind==='list')navigate({cursor:shown.value.next_cursor,trail:JSON.stringify([...trail,cursor||""]) });}}><ChevronRight size={16} aria-hidden="true"/></Button></li>
      </ul><p>{cursor?'Halaman lanjutan':'Halaman awal'}</p></nav>
    </section>}
    {selected?<RecoveryDetail key={`${instanceId}:${selected}`} provider={provider} instanceId={instanceId} jobId={selected} onClose={()=>setSelected(null)}/>:null}
  </div>;
}
function RecoveryDetail({instanceId,jobId,onClose,provider}:{instanceId:string;jobId:string;onClose:()=>void;provider:RecoveryProvider}) {
  const processing=provider==='SJ';
  const [view,setView]=useState<RecoveryView|null>(null),[settled,setSettled]=useState(-1),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reason,setReason]=useState(''),[busyLabel,setBusyLabel]=useState('Memeriksa…');
  const [pending,setPending]=useState<string|null>(null),[absent,setAbsent]=useState(false),[localAbsent,setLocalAbsent]=useState(false),[message,setMessage]=useState(''),[reload,setReload]=useState(0),[scheduled,setScheduled]=useState(false),[stale,setStale]=useState(false);
  const original=useRef<Extract<RecoveryInput,{action:'retry'}>|null>(null);
  const loading=settled!==reload;
  const lock=useRef(false),alive=useRef(true),notice=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(error||message)notice.current?.focus();},[error,message]);
  useEffect(()=>{const controller=new AbortController();
    void request(instanceId,{action:'detail',jobId},AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),provider)
      .then(next=>{if(controller.signal.aborted)return;setView(next);setError('');setStale(false);const unknown=next.requests.find(r=>r.state==='UNKNOWN');if(unknown)setPending(unknown.id);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof RecoveryError?cause.message:'Rincian belum dapat dimuat. Periksa koneksi lalu coba lagi.');})
      .finally(()=>{if(!controller.signal.aborted)setSettled(reload);});return()=>controller.abort();
  },[instanceId,jobId,reload,provider]);
  const job=view?.value.kind==='detail'?view.value.item:null;
  async function act(action:'retry'|'check_result'|'repeat_request') {
    if(lock.current||!job)return;lock.current=true;setBusy(true);setBusyLabel(action==='check_result'?'Memeriksa…':'Menjadwalkan…');setError('');setMessage('');setAbsent(false);
    const requestId=pending??crypto.randomUUID();setPending(requestId);
    const input:RecoveryInput=action==='retry'?(original.current??{action,jobId,requestId,expectedRevision:job.revision,reason}):action==='repeat_request'&&localAbsent&&original.current?original.current:{action,requestId};
    if(input.action==='retry')original.current=input;
    try{const next=await request(instanceId,input,AbortSignal.timeout(20000),provider);
      if(!alive.current)return;
      if(next.value.kind==='receipt'&&next.value.state==='RECORDED'){setScheduled(true);setMessage(processing?'Pekerjaan dijadwalkan ulang. Hasil pemrosesan belum tersedia.':'Pengiriman dijadwalkan ulang. Hasil pengiriman belum tersedia.');setPending(null);}
      else if(next.value.kind==='receipt'){setAbsent(true);setMessage(`Permintaan belum tercatat di ${processing?'SJ':'bank'}. Anda dapat memeriksa lagi atau mengirim permintaan yang sama.`);}
      else throw Error('Hasil permintaan belum dapat dipastikan.');
    }catch(cause){if(alive.current){
      if(cause instanceof RecoveryError&&cause.code==='RECOVERY_JOB_CHANGED'){
        setPending(null);original.current=null;setStale(true);setError(cause.message);
      }else if(action==='check_result'&&cause instanceof RecoveryError&&cause.code==='RECOVERY_REQUEST_NOT_RECORDED'){
        setLocalAbsent(true);setAbsent(!!original.current);setMessage('Permintaan belum tercatat di Control. Tidak ada hasil penjadwalan yang dapat dipastikan.');
      }else setError((cause instanceof RecoveryError?cause.message:'Respons belum diterima.')+' Hasil penjadwalan belum pasti. Periksa hasil sebelum mencoba lagi.');
    }}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  return <ReviewDialog title={processing?'Periksa pemrosesan':'Periksa pengiriman'} onClose={onClose} busy={busy} footer={<Button variant="secondary" onClick={onClose} disabled={busy}>Tutup</Button>}>
    {loading?<p role="status">Memuat rincian…</p>:null}
    {error||message?<p ref={notice} tabIndex={-1} className="sj-context" role={error?'alert':'status'}>{error||message}</p>:null}
    {job?<><div className="sj-subject"><strong>{deliverySubject(job)}</strong><p>{'aggregate_id' in job?job.aggregate_id:job.id}</p><p>{deliveryLabels[job.state]} · diperiksa {reviewDate(view!.checkedAt)}</p></div>
      <dl className="sj-record"><div><dt>Percobaan</dt><dd>{job.attempt_count}</dd></div>{'acknowledged_at' in job?<div><dt>Diterima tujuan</dt><dd>{reviewDate(job.acknowledged_at)}</dd></div>:null}</dl>
      {pending?<div className="sj-recovery-actions"><Button variant="secondary" data-initial-focus disabled={busy||loading} onClick={()=>void act('check_result')}>{busy?busyLabel:'Periksa hasil permintaan'}</Button>{absent?<Button variant="secondary" disabled={busy||loading} onClick={()=>void act('repeat_request')}>Kirim permintaan yang sama</Button>:null}</div>:scheduled?<p>Gunakan Refresh pada daftar untuk melihat hasil berikutnya.</p>:job.retry.allowed?<form onSubmit={e=>{e.preventDefault();void act('retry');}}><p>Jadwalkan ulang setelah penyebab kegagalan ditangani. Isi pengajuan dan keputusan tidak diubah.</p><label className="sj-recovery-reason">Alasan penjadwalan ulang<textarea required minLength={5} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy||loading} rows={3}/></label><Button variant="primary" className="sj-primary" disabled={busy||loading||stale||reason.trim().length<5} type="submit">{busy?'Menjadwalkan…':'Jadwalkan ulang'}</Button></form>:<p className="sj-context">{recoveryBlockLabel(job.retry.reason)}</p>}
    </>:null}
    {!busy?<Button variant="secondary" className="sj-recovery-refresh" onClick={()=>setReload(n=>n+1)} disabled={loading}><RefreshCw size={16} aria-hidden="true"/>Refresh</Button>:null}
  </ReviewDialog>;
}
