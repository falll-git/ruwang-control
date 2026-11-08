import { cookies } from "next/headers";
import { getRuntimeConfig } from "@/src/lib/env";
import { loadOperatorSession, type OperatorSession } from "./service";
import { sessionCookieName } from "./request";
import type { NextRequest } from "next/server";
import { SessionExpiredError } from "@/src/server/errors";
import { readSessionToken } from "./request";

export async function getCurrentOperatorSession(): Promise<OperatorSession | null> {
  const config = getRuntimeConfig();
  const cookieStore = await cookies();
  return loadOperatorSession(cookieStore.get(sessionCookieName(config))?.value ?? null, config, {
    requestId: crypto.randomUUID(),
  });
}

export async function requireRequestOperatorSession(request: NextRequest, requestId: string): Promise<OperatorSession> {
  const config = getRuntimeConfig();
  const session = await loadOperatorSession(readSessionToken(request, config), config, { requestId });
  if (!session) throw new SessionExpiredError();
  return session;
}
