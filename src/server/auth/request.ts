import type { NextRequest, NextResponse } from "next/server";
import type { RuntimeConfig } from "@/src/lib/env";
import { CsrfError, RequestValidationError } from "@/src/server/errors";
import { privacyHash } from "./crypto";

export function sessionCookieName(config: RuntimeConfig): string {
  return config.CONTROL_APP_ENV === "production" ? "__Host-control_session" : "control_session";
}

export function readSessionToken(request: NextRequest, config: RuntimeConfig): string | null {
  return request.cookies.get(sessionCookieName(config))?.value ?? null;
}

export function setSessionCookie(response: NextResponse, token: string, config: RuntimeConfig): void {
  response.cookies.set(sessionCookieName(config), token, {
    httpOnly: true,
    secure: config.CONTROL_APP_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: config.CONTROL_SESSION_ABSOLUTE_MINUTES * 60,
  });
}

export function clearSessionCookie(response: NextResponse, config: RuntimeConfig): void {
  response.cookies.set(sessionCookieName(config), "", {
    httpOnly: true,
    secure: config.CONTROL_APP_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export function requireJsonAndSameOrigin(request: NextRequest, config: RuntimeConfig): void {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new RequestValidationError("CONTENT_TYPE_REQUIRED");
  }
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(config.CONTROL_PUBLIC_ORIGIN).origin) throw new CsrfError("ORIGIN_MISMATCH");
}

export function requestFingerprint(request: NextRequest, config: RuntimeConfig): { ipHash: string | null; userAgentHash: string | null } {
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;
  const forwarded = config.CONTROL_TRUST_PROXY ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 80) : null;
  return {
    ipHash: forwarded ? privacyHash(`ip:${forwarded}`, config.CONTROL_AUTH_ENCRYPTION_KEY) : null,
    userAgentHash: userAgent ? privacyHash(`ua:${userAgent}`, config.CONTROL_AUTH_ENCRYPTION_KEY) : null,
  };
}
