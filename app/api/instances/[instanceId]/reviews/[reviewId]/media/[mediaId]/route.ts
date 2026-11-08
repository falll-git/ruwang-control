import type { NextRequest } from "next/server";
import { apiFailure } from "@/src/server/http";
import { requireRequestOperatorSession } from "@/src/server/auth/current-session";
import { getReviewMedia } from "@/src/server/reviews";
import { requireInstancePermission } from "@/src/server/auth/service";
import { reviewThumbnail } from "@/src/server/review-thumbnail";
import { RequestValidationError } from "@/src/server/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ instanceId: string; reviewId: string; mediaId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const auth = await requireRequestOperatorSession(request, requestId);
    const { instanceId, reviewId, mediaId } = await context.params;
    await requireInstancePermission(auth, "review.read", instanceId, requestId);
    const variants=request.nextUrl.searchParams.getAll("variant");
    if(variants.length>1 || variants.some(value=>value!=="thumbnail"))throw new RequestValidationError("MEDIA_VARIANT_INVALID");
    const original = await getReviewMedia(auth.principal, instanceId, reviewId, mediaId);
    const media = variants.length ? await reviewThumbnail(original.body) : original;
    return new Response(new Uint8Array(media.body), {
      status: 200,
      headers: { "content-type": media.mime, "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" },
    });
  } catch (error) { return apiFailure(error, requestId); }
}
