import { z } from "zod";
import { commandStates,lifecycleActions,reviewStates } from "./review-read.ts";
import { reviewSnapshotEnvelopeSchema } from "./review-snapshot.ts";

// Shared by server and future client: additive contract, no registry/transport payload.
const uuid=z.string().uuid(),time=z.string().datetime({offset:true});
export const reviewActionReadSchema=z.object({action:z.enum(["approve","request_revision","reject"]),allowed:z.boolean(),
  reasonCode:z.string().nullable(),reason:z.string().nullable(),requiresReason:z.boolean()}).strict();
export const reviewSummarySchema=z.object({
  id:uuid,instanceId:uuid,instanceName:z.string(),kind:z.enum(["profile","contact","publication","change_request"]),title:z.string(),sourceId:uuid,
  sourceVersion:z.number().int().positive(),state:z.enum(reviewStates),submittedAt:time,authority:z.enum(["local","central"]),
  commandState:z.enum(commandStates).nullable(),commandDecision:z.enum(["approve","request_revision","reject"]).nullable(),commandResultCode:z.string().nullable(),action:z.enum(lifecycleActions).nullable(),category:z.string().nullable(),
  actions:z.array(reviewActionReadSchema).max(3),latestReceivedVersion:z.number().int().positive(),
}).strict();
export const reviewPageSchema=z.object({
  items:z.array(reviewSummarySchema).max(100),
  filters:z.object({instanceId:uuid.optional(),sourceId:uuid.optional(),group:z.enum(["content","lifecycle"]),kind:z.enum(["profile","contact","publication","change_request"]).optional(),
    state:z.enum(["all",...reviewStates]),commandState:z.enum(["none",...commandStates]).optional(),action:z.enum(lifecycleActions).optional(),
    q:z.string(),sort:z.enum(["submitted_asc","submitted_desc"]),limit:z.number().int().min(1).max(100)}).strict(),
  page:z.object({limit:z.number().int().min(1).max(100),hasMore:z.boolean(),nextCursor:z.string().nullable(),
    number:z.number().int().positive().nullable(),lastPage:z.number().int().positive().nullable()}).strict(),
  count:z.object({value:z.number().int().nonnegative().safe(),scope:z.literal("FILTERED_AUTHORIZED_SNAPSHOTS"),includesCursor:z.literal(false)}).strict(),
  consistency:z.enum(["LIVE_KEYSET","LIVE_NUMBERED"]),
}).strict();
export type ReviewPage=z.infer<typeof reviewPageSchema>;
export type ReviewSummary=z.infer<typeof reviewSummarySchema>;

export const reviewDetailReadSchema=reviewSummarySchema.omit({action:true,category:true,latestReceivedVersion:true}).extend({
  checksum:z.string().regex(/^[a-f0-9]{64}$/),detail:reviewSnapshotEnvelopeSchema.shape.detail,
  commandId:uuid.nullable(),commandDecision:z.enum(["approve","request_revision","reject"]).nullable(),
  resultCheck:z.object({allowed:z.boolean(),reason:z.string().nullable()}).strict().nullable().default(null),
  decision:z.object({action:z.enum(["approve","request_revision","reject"]),note:z.string().nullable(),recordedAt:time,applicationState:z.enum(commandStates),resultCode:z.string().nullable()}).strict().nullable(),
  versions:z.object({submitted:z.number().int().positive(),latestReceived:z.object({id:uuid,version:z.number().int().positive()}).strict(),bankCurrent:z.null(),bankCurrentAvailability:z.literal("NOT_AVAILABLE")}).strict(),
}).strict();
export type ReviewDetailResponse=z.infer<typeof reviewDetailReadSchema>;
export const snapshotComparisonSchema=z.object({basis:z.literal("SUBMITTED_SNAPSHOTS"),
  from:z.object({id:uuid,version:z.number().int().positive()}).strict(),to:z.object({id:uuid,version:z.number().int().positive()}).strict(),
  changes:z.array(z.object({path:z.string(),before:z.unknown(),after:z.unknown()}).strict()),bankCurrentAvailability:z.literal("NOT_AVAILABLE"),publicVersionComparison:z.literal("NOT_PROVEN")}).strict();
export type SnapshotComparison=z.infer<typeof snapshotComparisonSchema>;
