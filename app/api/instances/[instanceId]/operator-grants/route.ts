import { NextResponse, type NextRequest } from "next/server";
import { apiFailure } from "@/src/server/http";
import { getRuntimeConfig } from "@/src/lib/env";
import { requireRequestOperatorSession } from "@/src/server/auth/current-session";
import { requireJsonAndSameOrigin } from "@/src/server/auth/request";
import { verifyCsrfToken } from "@/src/server/auth/service";

export const dynamic = "force-dynamic";

// Retired, not a successful no-op. Existing audit records remain intact.
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    requireJsonAndSameOrigin(request, getRuntimeConfig());
    const actor = await requireRequestOperatorSession(request, requestId);
    verifyCsrfToken(actor, request.headers.get("x-csrf-token"));
    return NextResponse.json({ error: { code: "ROLE_MANAGEMENT_REMOVED",
      message: "Semua akun menggunakan akses internal yang sama.", requestId } }, { status: 410 });
  } catch (error) { return apiFailure(error, requestId); }
}
