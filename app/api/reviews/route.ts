import type { NextRequest } from "next/server";
import { apiFailure,apiSuccess } from "@/src/server/http";
import { requireRequestOperatorSession } from "@/src/server/auth/current-session";
import { listReviewPage } from "@/src/server/review-read";

export const dynamic="force-dynamic";
export async function GET(request:NextRequest) {
  const requestId=crypto.randomUUID();
  try {
    const session=await requireRequestOperatorSession(request,requestId);
    return apiSuccess(await listReviewPage(session.principal,request.nextUrl.searchParams));
  }catch(error){return apiFailure(error,requestId);}
}
