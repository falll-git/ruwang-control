import { apiSuccess } from "@/src/server/http";
import { getPublicRelease } from "@/src/lib/env";

export const dynamic = "force-dynamic";
export function GET() { return apiSuccess({ status: "alive", service: "ruwang-control", release: getPublicRelease(), checkedAt: new Date().toISOString() }); }
