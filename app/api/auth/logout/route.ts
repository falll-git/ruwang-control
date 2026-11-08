import type { NextRequest } from "next/server";
import { apiFailure, apiSuccess } from "@/src/server/http";
import { getRuntimeConfig } from "@/src/lib/env";
import { SessionExpiredError } from "@/src/server/errors";
import { loadOperatorSession, logoutOperator, verifyCsrfToken } from "@/src/server/auth/service";
import { clearSessionCookie, readSessionToken, requireJsonAndSameOrigin } from "@/src/server/auth/request";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const config = getRuntimeConfig();
    requireJsonAndSameOrigin(request, config);
    const session = await loadOperatorSession(readSessionToken(request, config), config, { requestId, touch: false });
    if (!session) throw new SessionExpiredError();
    verifyCsrfToken(session, request.headers.get("x-csrf-token"));
    await logoutOperator(session, requestId);
    const response = apiSuccess({ loggedOut: true });
    clearSessionCookie(response, config);
    return response;
  } catch (error) { return apiFailure(error, requestId); }
}
