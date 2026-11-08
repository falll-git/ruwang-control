import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@/src/server/http";
import { query } from "@/src/server/database";
import { RequestValidationError } from "@/src/server/errors";
import { requireRequestOperatorSession } from "@/src/server/auth/current-session";
import { requireInstancePermission } from "@/src/server/auth/service";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();

export async function GET(request: NextRequest, context: { params: Promise<{ instanceId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const instanceId = idSchema.safeParse((await context.params).instanceId);
    if (!instanceId.success) throw new RequestValidationError("INSTANCE_ID_INVALID");
    const session = await requireRequestOperatorSession(request, requestId);
    await requireInstancePermission(session, "review.read", instanceId.data, requestId);
    // Legacy array contract: never silently ignore filters supplied by a new UI.
    if (request.nextUrl.search) throw new RequestValidationError("USE_PAGINATED_REVIEWS_ENDPOINT");
    const reviews = await query(`
      SELECT id::text, resource_kind, source_id::text, source_version, state, submitted_at
      FROM control.review_snapshots
      WHERE instance_id = $1 AND state = 'IN_REVIEW'
      ORDER BY submitted_at ASC, id ASC
      LIMIT 100
    `, [instanceId.data]);
    return apiSuccess(reviews);
  } catch (error) { return apiFailure(error, requestId); }
}
