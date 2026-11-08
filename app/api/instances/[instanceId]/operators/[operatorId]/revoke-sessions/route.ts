import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@/src/server/http";
import { getRuntimeConfig } from "@/src/lib/env";
import { RequestValidationError } from "@/src/server/errors";
import { requireRequestOperatorSession } from "@/src/server/auth/current-session";
import { requireJsonAndSameOrigin } from "@/src/server/auth/request";
import { revokeOperatorSessions, verifyCsrfToken } from "@/src/server/auth/service";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();

export async function POST(request: NextRequest, context: { params: Promise<{ instanceId: string; operatorId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const config = getRuntimeConfig();
    requireJsonAndSameOrigin(request, config);
    const params = await context.params;
    const instanceId = idSchema.safeParse(params.instanceId);
    const operatorId = idSchema.safeParse(params.operatorId);
    if (!instanceId.success || !operatorId.success) throw new RequestValidationError("SESSION_REVOKE_TARGET_INVALID");
    const actor = await requireRequestOperatorSession(request, requestId);
    verifyCsrfToken(actor, request.headers.get("x-csrf-token"));
    const revoked = await revokeOperatorSessions({ actor, instanceId: instanceId.data, targetOperatorId: operatorId.data, requestId });
    return apiSuccess({ revoked });
  } catch (error) { return apiFailure(error, requestId); }
}
