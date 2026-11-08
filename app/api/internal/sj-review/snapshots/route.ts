import type { NextRequest } from "next/server";
import { apiFailure } from "@/src/server/http";
import { acceptReviewSnapshot } from "@/src/server/review-snapshot-ingress";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const result = await acceptReviewSnapshot(request);
    return new Response(result.body, { status: 202, headers: { "content-type": "application/json", "cache-control": "no-store", ...result.headers } });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
