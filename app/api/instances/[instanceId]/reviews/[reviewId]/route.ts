import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@/src/server/http";
import { requireRequestOperatorSession } from "@/src/server/auth/current-session";
import { requireInstancePermission } from "@/src/server/auth/service";
import { RequestValidationError } from "@/src/server/errors";
import { getReviewDetail } from "@/src/server/reviews";

export const dynamic = "force-dynamic";
const id = z.string().uuid();

export async function GET(request: NextRequest, context: { params: Promise<{ instanceId: string; reviewId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const params = await context.params;
    const instanceId = id.safeParse(params.instanceId);
    const reviewId = id.safeParse(params.reviewId);
    if (!instanceId.success || !reviewId.success) throw new RequestValidationError("REVIEW_ID_INVALID");
    const session = await requireRequestOperatorSession(request, requestId);
    await requireInstancePermission(session, "review.read", instanceId.data, requestId);
    if (request.nextUrl.search) throw new RequestValidationError("REVIEW_QUERY_INVALID");
    const detail = await getReviewDetail(session.principal, reviewId.data, instanceId.data);
    if (detail && detail.instanceId !== instanceId.data) throw new RequestValidationError("REVIEW_TARGET_MISMATCH");
    return apiSuccess(detail);
  } catch (error) { return apiFailure(error, requestId); }
}
