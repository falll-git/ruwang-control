import type { NextRequest } from "next/server";
import { apiFailure, apiSuccess } from "@/src/server/http";
import { getRuntimeConfig } from "@/src/lib/env";
import { requireJsonAndSameOrigin } from "@/src/server/auth/request";
import { requireRequestOperatorSession } from "@/src/server/auth/current-session";
import { verifyCsrfToken } from "@/src/server/auth/service";
import { getMonitoringView, pollMonitoring } from "@/src/server/monitoring";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireRequestOperatorSession(request, requestId);
    return apiSuccess(await getMonitoringView(session.principal));
  } catch (error) { return apiFailure(error, requestId); }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const config = getRuntimeConfig();
    requireJsonAndSameOrigin(request, config);
    const session = await requireRequestOperatorSession(request, requestId);
    verifyCsrfToken(session, request.headers.get("x-csrf-token"));
    return apiSuccess(await pollMonitoring(session.principal));
  } catch (error) { return apiFailure(error, requestId); }
}
