import { z } from "zod";
import { monitorStatusSchema } from "./monitoring.ts";
import type { ReviewSummary } from "./review-read-contract.ts";
const time=z.iso.datetime({offset:true});
const part=z.object({key:z.string(),status:monitorStatusSchema,observedAt:time,detailCode:z.string().nullable()}).strict();
export const monitoringViewSchema=z.object({observedAt:time,enabled:z.boolean(),sources:z.array(z.object({
  instanceId:z.string().uuid(),instanceKey:z.string(),displayName:z.string(),sourceKind:z.enum(["ruwang","sj_central"]),
  status:monitorStatusSchema,observedAt:time.nullable(),nextPollAt:time.nullable(),
  lastSuccessfulCheck:z.object({checkedAt:time,sourceObservedAt:time,status:monitorStatusSchema}).strict().nullable(),
  lastAttempt:z.object({startedAt:time,code:z.string().nullable()}).strict().nullable(),
  lastFailure:z.object({at:time,code:z.string()}).strict().nullable(),evidenceScope:z.literal("SIGNED_PIPELINE_SNAPSHOT"),
  services:z.array(part),queues:z.array(part.extend({depth:z.number().int().nonnegative().safe().nullable()}).strict()),
}).strict())}).strict();
export type MonitoringView=z.infer<typeof monitoringViewSchema>;
export function sourceTimeDetails(source:MonitoringView["sources"][number],format:(time:string|null)=>string) {
  const checked=format(source.lastSuccessfulCheck?.checkedAt??null);
  const details:{label:string;value:string;result?:string}[]=[{label:"Pemeriksaan berhasil terakhir",value:checked}];
  const attempt=source.lastAttempt;
  // Remove repeated display text only; failed or unresolved attempts always remain visible.
  if(attempt&&(!source.lastSuccessfulCheck||attempt.code!=="OBSERVED"||format(attempt.startedAt)!==checked)) {
    details.push({label:"Percobaan terbaru",value:format(attempt.startedAt),result:attempt.code==="OBSERVED"?"Hasil diterima":attempt.code===null?"Hasil belum tersedia":sourceFailure(attempt.code)});
  }
  const observed=source.lastSuccessfulCheck?.sourceObservedAt;
  if(observed&&format(observed)!==checked)details.push({label:"Waktu data sumber",value:format(observed)});
  return details;
}
export const sourceLabels={healthy:"Tanpa kendala yang dilaporkan",degraded:"Ada kendala",offline:"Tidak dapat dihubungi",stale:"Perlu pemeriksaan baru",unknown:"Belum dapat dipastikan"};
export const componentLabels:Record<string,string>={frontend:"Aplikasi web",api:"Akses data",readiness:"Kesiapan layanan",worker:"Proses latar",pipeline:"Pengolahan data",review:"Pengajuan",outbox:"Pengiriman",media:"Media",central_jobs:"Pemrosesan SJ"};
export function sourceFailure(code:string|null|undefined){
  if(code==="SOURCE_TIMEOUT")return "Pemeriksaan melewati batas waktu.";
  if(code==="SOURCE_OFFLINE")return "Sumber belum dapat dihubungi.";
  if(code?.includes("SIGNATURE")||code?.includes("KEY"))return "Identitas respons belum dapat diverifikasi.";
  return "Pemeriksaan belum berhasil. Hasil terakhir tetap disimpan.";
}
export function applicationNext(state:ReviewSummary["commandState"],code:string|null,reviewState?:ReviewSummary["state"]){
  if(state==="UNKNOWN")return code==="COMMAND_TARGET_CHANGED"?"Tujuan berubah. Pengiriman ditahan agar tidak salah sasaran.":"Hasil bank belum pasti. Kirim ulang belum tersedia.";
  if(state==="REJECTED")return "Buka pengajuan untuk melihat kendala penerapan.";
  if(state==="PENDING")return "Keputusan tersimpan; menunggu pengiriman ke bank.";
  if(state==="DISPATCHING")return "Menunggu hasil dari bank.";
  if(state==="APPLIED")return "";
  if(reviewState==="SUPERSEDED")return "Gunakan pengajuan versi terbaru.";
  if(reviewState==="REVISION_REQUIRED")return "Menunggu perbaikan dari bank.";
  return "";
}
export function componentReason(code:string){
  const labels:Record<string,string>={OUTBOX_FAILED_ITEMS:"Ada pengiriman gagal atau ditahan.",MEDIA_REJECTED_ITEMS:"Ada media yang ditolak. Periksa media terkait di bank.",DEAD_LETTER_PRESENT:"Ada pekerjaan yang gagal diproses.",QUEUE_STATUS_UNAVAILABLE:"Status pekerjaan belum dapat diperiksa.",SJ_WORKER_HEARTBEAT_MISSING:"Aktivitas proses belum terdeteksi.",WORKER_HEARTBEAT_MISSING:"Aktivitas proses belum terdeteksi.",SJ_PIPELINE_NOT_CONFIGURED:"Koneksi SJ belum disiapkan.",SJ_PIPELINE_INACTIVE:"Koneksi SJ belum aktif.",FRONTEND_HTTP_ERROR:"Aplikasi web mengembalikan kesalahan.",FRONTEND_UNREACHABLE:"Aplikasi web belum dapat dihubungi.",FRONTEND_PROBE_INVALID:"Alamat pemeriksaan belum valid.",API_NOT_READY:"Layanan belum siap menerima pekerjaan.",DATABASE_UNAVAILABLE:"Penyimpanan belum dapat diakses."};
  return labels[code]??"Sumber melaporkan kendala yang belum dapat dijelaskan.";
}
