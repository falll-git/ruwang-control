import { z } from "zod";
import { authorize, type Principal } from "./authorization.ts";
import { validateDecision, type ReviewSnapshot } from "./review.ts";

export const reviewStates = ["IN_REVIEW", "REVISION_REQUIRED", "APPROVED", "REJECTED", "SUPERSEDED"] as const;
export const commandStates = ["PENDING", "DISPATCHING", "APPLIED", "REJECTED", "UNKNOWN"] as const;
export const lifecycleActions = ["UNPUBLISH_PUBLICATION", "ARCHIVE_PUBLICATION", "HIDE_PROFILE", "REVOKE_CONTACT", "REVOKE_MEDIA", "RECONFIRM_PUBLICATION"] as const;
export const reviewListQuerySchema = z.object({
  instanceId: z.string().uuid().optional(),
  sourceId: z.string().uuid().optional(),
  group: z.enum(["content", "lifecycle"]).default("content"),
  kind: z.enum(["profile", "contact", "publication", "change_request"]).optional(),
  state: z.enum(["all", ...reviewStates]).default("IN_REVIEW"),
  commandState: z.enum(["none", ...commandStates]).optional(),
  action: z.enum(lifecycleActions).optional(),
  q: z.string().trim().max(120).refine(s => !/[\u0000-\u001f\u007f]/.test(s)).default(""),
  sort: z.enum(["submitted_asc", "submitted_desc"]).default("submitted_asc"),
  limit: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(z.number().max(100)).default(25),
  cursor: z.string().min(1).max(2000).optional(),
  page: z.string().regex(/^[1-9]\d{0,5}$/).transform(Number).optional(),
}).strict().superRefine((v,c) => {
  if (v.cursor && v.page) c.addIssue({code:"custom",message:"Gunakan nomor halaman atau cursor, bukan keduanya."});
  if ((v.kind && (v.kind === "change_request") !== (v.group === "lifecycle")) || (v.action && v.group !== "lifecycle"))
    c.addIssue({code:"custom",message:"Filter jenis tidak sesuai kelompok."});
});
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
export function parseReviewListQuery(params: URLSearchParams): ReviewListQuery {
  const entries: Record<string,string> = Object.create(null);
  for (const [key,value] of params) {
    if (Object.hasOwn(entries,key)) throw new TypeError("REVIEW_QUERY_INVALID");
    entries[key]=value;
  }
  return reviewListQuerySchema.parse(entries);
}

export type ReviewAction = { action: "approve" | "request_revision" | "reject"; allowed: boolean; reasonCode: string | null; reason: string | null; requiresReason: boolean };
const reasons: Record<string,string> = {
  SNAPSHOT_SUPERSEDED:"Ada pengajuan yang lebih baru.", DECISION_ALREADY_RECORDED:"Keputusan sudah dicatat.",
  NOT_IN_REVIEW:"Pengajuan ini tidak sedang menunggu pemeriksaan.", SELF_REVIEW:"Anda terlibat dalam pengajuan ini.",
  CENTRAL_REVIEW_DISABLED:"Pemeriksaan di Control tidak aktif untuk instansi ini.",
  BANK_INTEGRATION_DISABLED:"Koneksi keputusan belum diaktifkan.", BANK_ADAPTER_NOT_CONFIGURED:"Koneksi keputusan belum lengkap.",
  CONTROL_KEY_ID_MISMATCH:"Konfigurasi koneksi keputusan belum sesuai.",
};
export function reviewActionEligibility(principal: Principal, snapshot: ReviewSnapshot, context: {
  authority:"local"|"central"; enabled:boolean; newer:boolean; hasDecision:boolean;
  integrationEnabled:boolean; adapterConfigured:boolean; keyMatches:boolean;
}): ReviewAction[] {
  const decisions = snapshot.kind === "change_request" ? ["approve","request_revision","reject"] as const : ["approve","request_revision"] as const;
  return decisions.filter(action => authorize(principal,action === "approve" ? "review.approve" : "review.request_revision",snapshot.instanceId).allowed).map(action => {
    const validation=validateDecision(principal,snapshot,{instanceId:snapshot.instanceId,reviewId:snapshot.id,
      decision:action,expectedVersion:snapshot.version,expectedChecksum:snapshot.checksum,reason:"Eligibility only"},
    {authority:context.authority,connected:true,auditWritable:true});
    const code = context.newer ? "SNAPSHOT_SUPERSEDED" : context.hasDecision ? "DECISION_ALREADY_RECORDED" : !validation.allowed ? validation.reason :
      !context.enabled ? "CENTRAL_REVIEW_DISABLED" : !context.integrationEnabled ? "BANK_INTEGRATION_DISABLED" :
      !context.adapterConfigured ? "BANK_ADAPTER_NOT_CONFIGURED" : !context.keyMatches ? "CONTROL_KEY_ID_MISMATCH" : null;
    return {action,allowed:code===null,reasonCode:code,reason:code ? reasons[code] ?? "Tindakan belum tersedia untuk pengajuan ini." : null,
      requiresReason:snapshot.kind === "change_request" || action === "request_revision"};
  });
}

export type SnapshotDifference = { path:string; before:unknown; after:unknown };
// Compare submitted public fields only, never envelopes/contributor identities.
export function compareSnapshotDetails(before:unknown, after:unknown): SnapshotDifference[] {
  const result:SnapshotDifference[]=[];
  const visit=(a:unknown,b:unknown,path:string) => {
    if (JSON.stringify(a)===JSON.stringify(b)) return;
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
      for(const key of [...new Set([...Object.keys(left),...Object.keys(right)])].sort())visit(left[key],right[key],`${path}/${key.replace(/~/g,"~0").replace(/\//g,"~1")}`);
    } else result.push({path,before:a??null,after:b??null});
  };
  visit(before,after,"");return result;
}
