import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@/src/server/http";
import { getRuntimeConfig } from "@/src/lib/env";
import { RequestValidationError } from "@/src/server/errors";
import { requireRequestOperatorSession } from "@/src/server/auth/current-session";
import { requireJsonAndSameOrigin } from "@/src/server/auth/request";
import { createOperator, verifyCsrfToken } from "@/src/server/auth/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  displayName: z.string().trim().min(2).max(160),
  password: z.string().min(14).max(128),
}).strict();

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const config = getRuntimeConfig();
    requireJsonAndSameOrigin(request, config);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new RequestValidationError("OPERATOR_INPUT_INVALID");
    const actor = await requireRequestOperatorSession(request, requestId);
    verifyCsrfToken(actor, request.headers.get("x-csrf-token"));
    return apiSuccess(await createOperator({ actor, ...parsed.data, requestId }), 201);
  } catch (error) { return apiFailure(error, requestId); }
}
