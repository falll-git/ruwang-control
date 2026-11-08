import { z } from "zod";
import { commandStates } from "./review-read.ts";
export const reviewLabels: Record<string, string> = {
  profile: "Profil BPRS", contact: "Kontak WhatsApp", publication: "Publikasi", change_request: "Permintaan perubahan",
  IN_REVIEW: "Menunggu pemeriksaan", REVISION_REQUIRED: "Perlu diperbaiki", APPROVED: "Disetujui", REJECTED: "Ditolak", SUPERSEDED: "Sudah digantikan",
  UNPUBLISH_PUBLICATION: "Penarikan publikasi", ARCHIVE_PUBLICATION: "Arsip publikasi", HIDE_PROFILE: "Sembunyikan profil",
  REVOKE_CONTACT: "Pencabutan kontak", REVOKE_MEDIA: "Pencabutan media", RECONFIRM_PUBLICATION: "Konfirmasi ketersediaan",
  LAND: "Tanah", BUILDING: "Bangunan", MACHINE_EQUIPMENT: "Mesin dan peralatan", VEHICLE: "Kendaraan", AVAILABLE: "Tersedia",
};
export const applicationLabels = { PENDING: "Menunggu penerapan", DISPATCHING: "Sedang dikirim ke bank", APPLIED: "Diterapkan di bank", REJECTED: "Tidak diterapkan bank", UNKNOWN: "Penerapan belum pasti" };
// Frozen bank lifecycle snapshot, not a current public observation. Source:
// bank Prisma sj_publication/profile/contact/media_states and changeRequest.service.
const bankSnapshotLabels: Record<string,string> = {
  DRAFT:"Draf", IN_REVIEW:"Menunggu pemeriksaan", REVISION_REQUIRED:"Perlu diperbaiki",
  APPROVED:"Disetujui", VERIFIED:"Diverifikasi", PUBLISHED:"Publikasi tercatat aktif di bank",
  UNPUBLISHED:"Publikasi ditarik di bank", ARCHIVED:"Diarsipkan", HIDDEN:"Profil disembunyikan di bank",
  UPLOAD_PENDING:"Menunggu unggahan", UPLOADED:"Diunggah", PROCESSING:"Media diproses",
  READY:"Media siap", REJECTED:"Ditolak", REVOKED:"Dicabut", DELETION_PENDING:"Menunggu penghapusan media", DELETED:"Media dihapus",
};
export function bankSnapshotStateLabel(value:string) {return bankSnapshotLabels[value]??"Status belum dikenali";}
export function applicationLabel(value: string | null) {return value && Object.hasOwn(applicationLabels,value) ? applicationLabels[value as keyof typeof applicationLabels] : "Belum ada keputusan";}
export const decisionLabels = { approve: "Setujui", request_revision: "Minta revisi", reject: "Tolak permintaan" };
export function reviewDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Belum tersedia";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(new Date(value)).replace(/\.(\d{2})$/, ":$1");
}
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Belum tersedia";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
export function safeReviewReturn(value: string | null) {
  return value && value.length <= 16000 && /^\/(?:reviews|monitoring)(?:\?[^#\\]*)?$/.test(value) && !/[\r\n]/.test(value) ? value : "/reviews";
}
// UI-only tab context and cursor trail never reach the API query parser.
export function reviewApiQuery(value: string) {
  const params = new URLSearchParams(value); params.delete("other"); params.delete("trail"); params.delete("view"); return params;
}
export function switchReviewGroup(value: string, group: "content" | "lifecycle") {
  const current = new URLSearchParams(value), stored = current.get("other") || "";
  if ((current.get("group") || "content") === group) return value;
  current.delete("other");
  const next = new URLSearchParams(stored); next.delete("other"); next.set("group", group); next.set("other", current.toString());
  return next.toString();
}
export function cursorTrail(value: string | null): string[] {
  try { const v: unknown = JSON.parse(value || "[]"); return z.array(z.string().max(2000)).max(50).parse(v); } catch { return []; }
}
export const decisionReceiptSchema = z.object({ commandId: z.string().uuid(), state: z.enum(commandStates), resultCode: z.string().nullable() });
export const commandLookupSchema = z.object({ id: z.string().uuid(), snapshot_id: z.string().uuid(), instance_id: z.string().uuid(), state: z.enum(commandStates), result_code: z.string().nullable() });
export const commandIntentSchema = commandLookupSchema.extend({decision_note:z.string().nullable(),request_payload:z.object({decision:z.enum(["approve","request_revision","reject"]),expected_version:z.number().int().positive(),expected_checksum:z.string(),reason:z.string().optional()})});
