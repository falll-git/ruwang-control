import { z } from "zod";
import { authorize,type Principal } from "@/src/domain/authorization";
import { payloadDigest } from "@/src/domain/control-review-contract";
import { compareSnapshotDetails,parseReviewListQuery,type ReviewListQuery } from "@/src/domain/review-read";
import { query } from "@/src/server/database";
import { AuthorizationError,RequestValidationError } from "@/src/server/errors";
import { reviewBaseQuery,reviewStatusSql,reviewInstanceIds,parseReviewEnvelope,projectReview,reviewActions,type ReviewRow } from "@/src/server/reviews";
import { decodeReviewCursor,encodeReviewCursor } from "@/src/server/review-cursor";
import { reviewPageSchema,snapshotComparisonSchema } from "@/src/domain/review-read-contract";

export async function listReviewPage(principal:Principal,params:URLSearchParams) {
  let filters:ReviewListQuery;
  try {filters=parseReviewListQuery(params);}catch{throw new RequestValidationError("REVIEW_QUERY_INVALID");}
  const permitted=reviewInstanceIds(principal).sort();
  if(filters.instanceId&&!authorize(principal,"review.read",filters.instanceId).allowed)throw new AuthorizationError();
  const ids=filters.instanceId?[filters.instanceId]:permitted;
  const {cursor:rawCursor,page:requestedPage,...scopeFilters}=filters;
  const scope=payloadDigest({filters:scopeFilters,instances:ids,principal:principal.id});
  const cursor=decodeReviewCursor(rawCursor,scope);
  const values:unknown[]=[ids];
  const bind=(v:unknown)=>{values.push(v);return `$${values.length}`;};
  const where=["s.instance_id=ANY($1::uuid[])","s.envelope_json IS NOT NULL",
    filters.group==="content"?"s.resource_kind <> 'change_request'":"s.resource_kind = 'change_request'"];
  if(filters.kind)where.push(`s.resource_kind=${bind(filters.kind)}`);
  if(filters.sourceId)where.push(`s.source_id=${bind(filters.sourceId)}::uuid`);
  if(filters.state!=="all")where.push(`(${reviewStatusSql})=${bind(filters.state)}`);
  if(filters.commandState)where.push(filters.commandState==="none"?"command.id IS NULL":`command.state=${bind(filters.commandState)}`);
  if(filters.action)where.push(`s.envelope_json->'detail'->>'action'=${bind(filters.action)}`);
  if(filters.q) {
    const q=bind(filters.q);
    where.push(`strpos(lower(concat_ws(' ',s.envelope_json->'detail'->>'title',s.envelope_json->'detail'->>'public_name',
      s.envelope_json->'detail'->>'label',s.envelope_json->'detail'->>'target_label',s.envelope_json->'detail'->>'reference_code')),lower(${q}))>0`);
  }
  const direction=filters.sort==="submitted_asc"?"ASC":"DESC",op=direction==="ASC"?">":"<";
  const pageWhere=cursor?`WHERE (submitted_at,id::uuid) ${op} (${bind(cursor.time)}::timestamptz,${bind(cursor.id)}::uuid)`:"";
  const numbered=requestedPage!==undefined;
  const requested=bind(requestedPage??1),pageSize=bind(filters.limit);
  const limit=bind(filters.limit+1);
  // A single statement snapshot keeps count and page filters consistent, including empty pages.
  const [result]=await query<{items:ReviewRow[];total:string;page_number:number;last_page:number}>(`WITH filtered AS MATERIALIZED (${reviewBaseQuery} WHERE ${where.join(" AND ")}),
    totals AS (SELECT count(*) AS total FROM filtered),
    bounds AS (SELECT total,GREATEST(1,CEIL(total::numeric/${pageSize}::int))::int AS last_page FROM totals),
    position AS (SELECT total,last_page,LEAST(${requested}::int,last_page) AS page_number FROM bounds),
    page AS (SELECT * FROM filtered ${pageWhere} ORDER BY submitted_at ${direction},id::uuid ${direction} LIMIT ${limit}
      OFFSET ${numbered?`(SELECT (page_number-1)*${pageSize}::int FROM position)`:"0"})
    SELECT total::text,last_page,page_number,COALESCE((SELECT jsonb_agg(page ORDER BY submitted_at ${direction},id::uuid ${direction}) FROM page),'[]'::jsonb) AS items FROM position`,values);
  if(!result)throw new Error("REVIEW_PAGE_UNAVAILABLE");
  const rows=result.items.slice(0,filters.limit).map(row=>({...row,submitted_at:new Date(row.submitted_at),command_created_at:row.command_created_at?new Date(row.command_created_at):null}));
  const envelopes=rows.map(parseReviewEnvelope);
  const items=rows.map((row,index)=>{
    const envelope=envelopes[index]!;
    return {...projectReview(row,envelope),sourceId:row.source_id,action:envelope.detail.kind==="change_request"?envelope.detail.action:null,
      category:envelope.detail.kind==="publication"?envelope.detail.category:null,
      commandResultCode:row.command_result_code,actions:reviewActions(principal,row,envelope),
      latestReceivedVersion:row.latest_version};
  });
  const hasMore=result.items.length>filters.limit,last=rows.at(-1);
  return reviewPageSchema.parse({items,filters:scopeFilters,page:{limit:filters.limit,hasMore,nextCursor:!numbered&&hasMore&&last?encodeReviewCursor(scope,last.sort_time,last.id):null,
    number:numbered?result.page_number:null,lastPage:numbered?result.last_page:null},
    count:{value:z.number().int().nonnegative().safe().parse(Number(result.total)),scope:"FILTERED_AUTHORIZED_SNAPSHOTS" as const,includesCursor:false as const},
    consistency:numbered?"LIVE_NUMBERED":"LIVE_KEYSET"});
}
export type { ReviewPage } from "@/src/domain/review-read-contract";

export async function getSnapshotComparison(principal:Principal,instanceId:string,reviewId:string,againstId:string) {
  if(![instanceId,reviewId,againstId].every(id=>z.string().uuid().safeParse(id).success))throw new RequestValidationError("REVIEW_ID_INVALID");
  if(!authorize(principal,"review.read",instanceId).allowed)throw new AuthorizationError();
  const rows=await query<ReviewRow>(`${reviewBaseQuery} WHERE s.instance_id=$1 AND s.id=ANY($2::uuid[]) AND s.envelope_json IS NOT NULL`,[instanceId,[reviewId,againstId]]);
  const current=rows.find(r=>r.id===reviewId),previous=rows.find(r=>r.id===againstId);
  // Same non-enumerating error for missing/out-of-scope reference.
  if(!current||!previous)throw new RequestValidationError("REVIEW_COMPARISON_UNAVAILABLE");
  if(current.source_id!==previous.source_id||current.resource_kind!==previous.resource_kind)throw new RequestValidationError("REVIEW_COMPARISON_TARGET_MISMATCH");
  const after=parseReviewEnvelope(current),before=parseReviewEnvelope(previous);
  return snapshotComparisonSchema.parse({basis:"SUBMITTED_SNAPSHOTS",from:{id:previous.id,version:previous.source_version},to:{id:current.id,version:current.source_version},
    changes:compareSnapshotDetails(before.detail,after.detail),bankCurrentAvailability:"NOT_AVAILABLE",publicVersionComparison:"NOT_PROVEN"});
}
export type { SnapshotComparison } from "@/src/domain/review-read-contract";
