import type { NextRequest } from "next/server";
import { apiFailure,apiSuccess } from "@/src/server/http";
import { requireRequestOperatorSession } from "@/src/server/auth/current-session";
import { RequestValidationError } from "@/src/server/errors";
import { getSnapshotComparison } from "@/src/server/review-read";

export const dynamic="force-dynamic";
export async function GET(request:NextRequest,context:{params:Promise<{instanceId:string;reviewId:string}>}) {
  const requestId=crypto.randomUUID();
  try {
    const session=await requireRequestOperatorSession(request,requestId),params=await context.params;
    const query=request.nextUrl.searchParams;
    if([...query.keys()].some(k=>k!=="against")||query.getAll("against").length!==1)throw new RequestValidationError("REVIEW_QUERY_INVALID");
    return apiSuccess(await getSnapshotComparison(session.principal,params.instanceId,params.reviewId,query.get("against")!));
  }catch(error){return apiFailure(error,requestId);}
}
