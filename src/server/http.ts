import { NextResponse } from "next/server";
import { toPublicError } from "@/src/server/errors";

export function apiSuccess(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiFailure(error: unknown, requestId = crypto.randomUUID()): NextResponse {
  const publicError = toPublicError(error);
  if (publicError.status >= 500) {
    const databaseCode = typeof error === "object" && error && "code" in error && typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
      ? error.code : undefined;
    console.error("control_request_failed", { requestId, code: publicError.code,
      errorName: error instanceof Error ? error.name : "UnknownError", ...(databaseCode ? { databaseCode } : {}) });
  }
  return NextResponse.json(
    { error: { code: publicError.code, message: publicError.message, requestId } },
    { status: publicError.status, headers: { "Cache-Control": "no-store" } },
  );
}
