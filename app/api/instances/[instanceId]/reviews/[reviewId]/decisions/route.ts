import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@/src/server/http";
import { getRuntimeConfig } from "@/src/lib/env";
import { RequestValidationError } from "@/src/server/errors";
import { requireRequestOperatorSession } from "@/src/server/auth/current-session";
import { requireJsonAndSameOrigin } from "@/src/server/auth/request";
import { verifyCsrfToken } from "@/src/server/auth/service";
import { dispatchReviewCommand, enqueueReviewDecision, getReviewCommand } from "@/src/server/review-adapter";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();
const bodySchema = z.object({
  decision: z.enum(["approve", "request_revision", "reject"]),
  reason: z.string().max(2000).default(""),
  expectedVersion: z.number().int().positive(),
  expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((value, context) => {
  if (value.decision === "request_revision" && !value.reason.trim()) context.addIssue({ code: "custom", path: ["reason"], message: "wajib" });
});

export async function POST(request: NextRequest, context: { params: Promise<{ instanceId: string; reviewId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const config = getRuntimeConfig();
    requireJsonAndSameOrigin(request, config);
    const params = await context.params;
    const instanceId = idSchema.safeParse(params.instanceId);
    const reviewId = idSchema.safeParse(params.reviewId);
    const commandId = idSchema.safeParse(request.headers.get("idempotency-key"));
    const body = bodySchema.safeParse(await request.json());
    if (!instanceId.success || !reviewId.success || !commandId.success || !body.success) throw new RequestValidationError("REVIEW_DECISION_INVALID");
    const actor = await requireRequestOperatorSession(request, requestId);
    verifyCsrfToken(actor, request.headers.get("x-csrf-token"));
    const id = await enqueueReviewDecision({ commandId: commandId.data, instanceId: instanceId.data, reviewId: reviewId.data,
      ...body.data, requestId, actor });
    try {
      const command = await dispatchReviewCommand(id);
      return apiSuccess({ commandId: id, state: command.state, resultCode: command.result_code,
        acknowledgment: command.acknowledgment_payload }, command.state === "APPLIED" ? 200 : 202);
    } catch {
      const recorded = await getReviewCommand(instanceId.data, id);
      return apiSuccess({ commandId: id, state: recorded?.state ?? "UNKNOWN", resultCode: recorded?.result_code ?? "RECONCILIATION_REQUIRED" }, 202);
    }
  } catch (error) { return apiFailure(error, requestId); }
}
