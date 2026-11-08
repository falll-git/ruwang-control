import type { NextRequest } from "next/server";
import { apiFailure, apiSuccess } from "@/src/server/http";
import { getRuntimeConfig } from "@/src/lib/env";
import { SessionExpiredError } from "@/src/server/errors";
import { loadOperatorSession } from "@/src/server/auth/service";
import { readSessionToken } from "@/src/server/auth/request";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const config = getRuntimeConfig();
    const session = await loadOperatorSession(readSessionToken(request, config), config, { requestId });
    if (!session) throw new SessionExpiredError();
    return apiSuccess({ operator: session.operator, expiresAt: session.absoluteExpiresAt });
  } catch (error) { return apiFailure(error, requestId); }
}
