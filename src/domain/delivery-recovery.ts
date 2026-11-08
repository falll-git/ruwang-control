import {z} from 'zod';
const uuid=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/),time=z.string().datetime({offset:true});
export const deliveryStates=['QUEUED','SENDING','ACKNOWLEDGED','RETRYING','FAILED','QUARANTINED'] as const;
export const processingStates=['PENDING','PROCESSING','RETRY_WAIT','COMPLETED','DEAD_LETTER'] as const;
export type RecoveryProvider='BANK'|'SJ';
export const processingPath='/v1/internal/ruwang-control/sj-jobs/recovery';
export const sjRecoveryBindingSchema=z.object({url:z.string().url(),audience:z.string().min(1).max(150),
  institutionId:uuid,installationId:uuid,keyId:z.string().regex(/^[A-Za-z0-9._-]{2,100}$/),publicKey:z.string().min(1)}).strict();
export const recoveryPath='/api/v1/internal/ruwang-control/sj-review/recovery';
export const recoveryJobSchema=z.object({id:uuid,event_id:uuid,aggregate_type:z.string().min(1).max(64),aggregate_id:uuid,
  aggregate_version:z.number().int().nonnegative(),event_type:z.string().min(1).max(64),state:z.enum(deliveryStates),
  attempt_count:z.number().int().nonnegative(),available_at:time,created_at:time,acknowledged_at:time.nullable(),revision:hash,
  retry:z.object({allowed:z.boolean(),reason:z.string().min(1).max(100).nullable()}).strict()
    .refine(v=>v.allowed === (v.reason===null)),
}).strict();
export const processingJobSchema=z.object({id:uuid,job_type:z.string().min(1).max(100),state:z.enum(processingStates),
  attempt_count:z.number().int().nonnegative(),available_at:time,created_at:time,revision:hash,
  retry:recoveryJobSchema.shape.retry}).strict();
const job=z.union([recoveryJobSchema,processingJobSchema]);
const receipt=z.object({request_id:uuid,request_digest:hash,job_id:uuid,state:z.literal('SCHEDULED'),
  scheduled_at:time,previous_revision:hash}).strict();
const responseBase=z.object({contract_version:z.literal(1),instance_id:uuid,operator_id:uuid,
  request_nonce:uuid,request_digest:hash,checked_at:time,value:z.discriminatedUnion('kind',[
    z.object({kind:z.literal('list'),items:z.array(job).max(25),next_cursor:uuid.nullable(),
      scope:z.literal('BOUND_INSTALLATION'),total:z.null()}).strict(),
    z.object({kind:z.literal('detail'),item:job}).strict(),
    z.object({kind:z.literal('receipt'),state:z.enum(['NOT_RECORDED','RECORDED']),result:receipt.nullable()}).strict()
      .refine(v=>(v.state==='RECORDED')===(v.result!==null)),
  ])}).strict();
export const recoveryResponseSchema=z.union([responseBase,responseBase.extend({institution_id:uuid,installation_id:uuid}).strict()]);
export const recoveryInputSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('list'),cursor:uuid.nullable(),state:z.enum([...deliveryStates,...processingStates]).nullable()}).strict(),
  z.object({action:z.literal('detail'),jobId:uuid}).strict(),
  z.object({action:z.literal('retry'),jobId:uuid,requestId:uuid,expectedRevision:hash,
    reason:z.string().trim().min(5).max(500).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f]*$/)}).strict(),
  z.object({action:z.literal('check_result'),requestId:uuid}).strict(),
  z.object({action:z.literal('repeat_request'),requestId:uuid}).strict(),
]);
export type RecoveryInput=z.infer<typeof recoveryInputSchema>;
export type RecoveryResponse=z.infer<typeof recoveryResponseSchema>;
export type RecoveryJob=z.infer<typeof job>;
export const recoveryViewSchema=z.object({value:responseBase.shape.value,checkedAt:time,
  requests:z.array(z.object({id:uuid,job_id:uuid,state:z.enum(['UNKNOWN','RECORDED']),created_at:time,result_json:receipt.nullable()}).strict()).max(25),
}).strict();
export type RecoveryView=z.infer<typeof recoveryViewSchema>;
export const deliveryLabels:Record<RecoveryJob['state'],string>={QUEUED:'Menunggu dikirim',SENDING:'Sedang dikirim',
  ACKNOWLEDGED:'Diterima tujuan',RETRYING:'Menunggu percobaan berikutnya',FAILED:'Pengiriman gagal',QUARANTINED:'Ditahan untuk diperiksa',
  PENDING:'Menunggu diproses',PROCESSING:'Sedang diproses',RETRY_WAIT:'Menunggu percobaan berikutnya',COMPLETED:'Pemrosesan selesai',DEAD_LETTER:'Pemrosesan gagal'};
export function deliverySubject(job:Pick<z.infer<typeof recoveryJobSchema>,'aggregate_type'|'aggregate_version'>|{job_type:string}) {
  if('job_type' in job){const types:Record<string,string>={PROCESS_MEDIA:'Pemrosesan media',REBUILD_PUBLICATION_PROJECTION:'Pembaruan publikasi',RECONCILE_MANIFEST:'Pemeriksaan kesesuaian data'};return types[job.job_type]??'Pemrosesan data';}
  const labels:Record<string,string>={BPRS_PROFILE:'Profil BPRS',BANK_PROFILE:'Profil BPRS',PROFILE:'Profil BPRS',CONTACT:'Kontak',PUBLICATION:'Publikasi',MEDIA:'Media',CHANGE_REQUEST:'Permintaan perubahan'};
  return `${labels[job.aggregate_type]??'Data pengajuan'} · versi ${job.aggregate_version}`;
}
export function recoveryBlockLabel(reason:string|null) {
  const labels:Record<string,string>={DELIVERY_DISABLED:'Pengiriman bank belum diaktifkan.',JOB_NOT_RETRYABLE:'Pekerjaan ini tidak dapat dijadwalkan ulang.',
    JOB_OWNED:'Pekerjaan sedang ditangani. Muat ulang sebelum mencoba lagi.',OUTBOX_TARGET_CHANGED:'Tujuan pengiriman sudah berubah. Jangan kirim ulang ke tujuan baru.',
    OUTBOX_TARGET_UNBOUND:'Tujuan awal pengiriman belum dapat dibuktikan.'};
  return reason?labels[reason]??'Konfigurasi atau tujuan pengiriman belum memenuhi syarat.':null;
}
