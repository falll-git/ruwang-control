import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@/src/server/http";
import { CommandNotFoundError, RequestValidationError } from "@/src/server/errors";
import { requireRequestOperatorSession } from "@/src/server/auth/current-session";
import { requireInstancePermission } from "@/src/server/auth/service";
import { getReviewCommand } from "@/src/server/review-adapter";
import { reconcileReviewCommand } from "@/src/server/review-adapter";
import { getRuntimeConfig } from "@/src/lib/env";
import { requireJsonAndSameOrigin } from "@/src/server/auth/request";
import { verifyCsrfToken } from "@/src/server/auth/service";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();
export async function POST(request: NextRequest, context: { params: Promise<{ instanceId: string; commandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    requireJsonAndSameOrigin(request, getRuntimeConfig());
    const params = await context.params;
    const instanceId = idSchema.safeParse(params.instanceId), commandId = idSchema.safeParse(params.commandId);
    if (!instanceId.success || !commandId.success || !z.object({ action: z.literal("check_result") }).strict().safeParse(await request.json()).success) {
      throw new RequestValidationError("COMMAND_ID_INVALID");
    }
    const actor = await requireRequestOperatorSession(request, requestId);
    verifyCsrfToken(actor, request.headers.get("x-csrf-token"));
    const result = await reconcileReviewCommand({ instanceId: instanceId.data, commandId: commandId.data, actor, requestId });
    return apiSuccess(result);
  } catch (error) { return apiFailure(error, requestId); }
}
export async function GET(request: NextRequest, context: { params: Promise<{ instanceId: string; commandId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const params = await context.params;
    const instanceId = idSchema.safeParse(params.instanceId);
    const commandId = idSchema.safeParse(params.commandId);
    if (!instanceId.success || !commandId.success) throw new RequestValidationError("COMMAND_ID_INVALID");
    const actor = await requireRequestOperatorSession(request, requestId);
    await requireInstancePermission(actor, "review.read", instanceId.data, requestId);
    const command = await getReviewCommand(instanceId.data, commandId.data);
    if (!command) throw new CommandNotFoundError();
    return apiSuccess(command);
  } catch (error) { return apiFailure(error, requestId); }
}
