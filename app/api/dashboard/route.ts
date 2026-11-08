import { getDashboardSnapshot } from "@/src/server/dashboard";
import { apiFailure, apiSuccess } from "@/src/server/http";
import type { NextRequest } from "next/server";
import { requireRequestOperatorSession } from "@/src/server/auth/current-session";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireRequestOperatorSession(request, requestId);
    return apiSuccess(await getDashboardSnapshot(session.principal));
  } catch (error) { return apiFailure(error, requestId); }
}
