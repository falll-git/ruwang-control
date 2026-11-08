import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiFailure, apiSuccess } from "@/src/server/http";
import { getRuntimeConfig } from "@/src/lib/env";
import { RequestValidationError } from "@/src/server/errors";
import { loginOperator } from "@/src/server/auth/service";
import { requestFingerprint, requireJsonAndSameOrigin, setSessionCookie } from "@/src/server/auth/request";

export const dynamic = "force-dynamic";
const bodySchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  password: z.string().min(1).max(128),
}).strict();

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const config = getRuntimeConfig();
    requireJsonAndSameOrigin(request, config);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new RequestValidationError("LOGIN_INPUT_INVALID");
    const result = await loginOperator(parsed.data, { requestId, ...requestFingerprint(request, config) }, config);
    const response = apiSuccess({ operator: result.session.operator, expiresAt: result.session.absoluteExpiresAt });
    setSessionCookie(response, result.token, config);
    return response;
  } catch (error) { return apiFailure(error, requestId); }
}
