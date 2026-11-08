import { timingSafeEqual } from "node:crypto";
import type { QueryResultRow } from "pg";
import { authorize, type Action, type Principal } from "@/src/domain/authorization";
import type { RuntimeConfig } from "@/src/lib/env";
import { query, withTransaction, type DatabaseClient } from "@/src/server/database";
import {currentActionPrincipal, currentOperatorPrincipal} from "@/src/server/review-guards";
import { registeredInternalScopes } from "./internal-access";
import {
  AuthenticationError, AuthorizationError, ConflictError, CsrfError, RateLimitError, RequestValidationError, SessionExpiredError,
} from "@/src/server/errors";
import {
  hashPassword, passwordPolicyError, privacyHash, randomToken, sha256, verifyPassword,
} from "./crypto";

type OperatorRow = QueryResultRow & {
  id: string;
  username_canonical: string;
  display_name: string;
  status: "active" | "disabled";
  password_hash: string;
  access_role: string;
};

type SessionRow = QueryResultRow & {
  id: string;
  operator_id: string;
  username_canonical: string;
  display_name: string;
  operator_status: "active" | "disabled";
  access_role: string;
  csrf_token_hash: string | null;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
};

type RateRow = QueryResultRow & { attempts: number; window_started_at: Date; blocked_until: Date | null };

export type OperatorSession = {
  sessionId: string;
  operator: { id: string; username: string; displayName: string };
  principal: Principal;
  csrfTokenHash: string | null;
  absoluteExpiresAt: string;
};

type LoginInput = { username: string; password: string };
type RequestContext = { requestId: string; ipHash: string | null; userAgentHash: string | null; now?: Date };

async function rows<Row extends QueryResultRow>(client: DatabaseClient, text: string, values: readonly unknown[] = []): Promise<readonly Row[]> {
  return (await client.query<Row>(text, [...values])).rows;
}

async function audit(client: DatabaseClient, input: {
  requestId: string;
  actorOperatorId?: string | null;
  subjectHash?: string | null;
  instanceId?: string | null;
  targetOperatorId?: string | null;
  action: string;
  outcome: "succeeded" | "rejected" | "denied";
  reasonCode: string;
  now: Date;
}): Promise<void> {
  await client.query(`
    INSERT INTO control.security_audit_events
      (id, request_id, actor_operator_id, subject_hash, instance_id, target_operator_id, action, outcome, reason_code, occurred_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [crypto.randomUUID(), input.requestId, input.actorOperatorId ?? null, input.subjectHash ?? null,
    input.instanceId ?? null, input.targetOperatorId ?? null, input.action, input.outcome, input.reasonCode, input.now]);
}

function rateScope(username: string, ipHash: string | null, config: RuntimeConfig): string {
  return privacyHash(`login:${username}:${ipHash ?? "untrusted-proxy-disabled"}`, config.CONTROL_AUTH_ENCRYPTION_KEY);
}

export async function loginOperator(input: LoginInput, context: RequestContext, config: RuntimeConfig): Promise<{ token: string; session: OperatorSession }> {
  const username = input.username.trim().toLowerCase();
  const now = context.now ?? new Date();
  const scopeHash = rateScope(username, context.ipHash, config);

  const result = await withTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [username]);
    const rate = (await rows<RateRow>(client, `
      SELECT attempts, window_started_at, blocked_until FROM control.auth_rate_limits WHERE scope_hash = $1 FOR UPDATE
    `, [scopeHash]))[0];
    if (rate?.blocked_until && rate.blocked_until.getTime() > now.getTime()) {
      await audit(client, { requestId: context.requestId, subjectHash: privacyHash(username, config.CONTROL_AUTH_ENCRYPTION_KEY),
        action: "auth.login", outcome: "rejected", reasonCode: "RATE_LIMITED", now });
      return { ok: false as const, rateLimited: true };
    }

    const operator = (await rows<OperatorRow>(client, `
      SELECT o.id, o.username_canonical, o.display_name, o.status, o.access_role, p.password_hash
      FROM control.operators o
      JOIN control.operator_password_credentials p ON p.operator_id = o.id
      WHERE o.username_canonical = $1
    `, [username]))[0];

    const passwordValid = await verifyPassword(input.password, operator?.password_hash ?? null);
    if (!operator || operator.status !== "active" || operator.access_role !== "internal_operator" || !passwordValid) {
      const withinWindow = rate && now.getTime() - rate.window_started_at.getTime() < config.CONTROL_LOGIN_RATE_WINDOW_SECONDS * 1000;
      const attempts = withinWindow ? rate.attempts + 1 : 1;
      const windowStartedAt = withinWindow ? rate.window_started_at : now;
      const blockedUntil = attempts >= config.CONTROL_LOGIN_RATE_MAX_ATTEMPTS
        ? new Date(windowStartedAt.getTime() + config.CONTROL_LOGIN_RATE_WINDOW_SECONDS * 1000)
        : null;
      await client.query(`
        INSERT INTO control.auth_rate_limits (scope_hash, attempts, window_started_at, blocked_until, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (scope_hash) DO UPDATE SET attempts = EXCLUDED.attempts,
          window_started_at = EXCLUDED.window_started_at, blocked_until = EXCLUDED.blocked_until, updated_at = EXCLUDED.updated_at
      `, [scopeHash, attempts, windowStartedAt, blockedUntil, now]);
      await audit(client, { requestId: context.requestId, actorOperatorId: operator?.id ?? null,
        subjectHash: privacyHash(username, config.CONTROL_AUTH_ENCRYPTION_KEY), action: "auth.login", outcome: "rejected",
        reasonCode: !operator || !passwordValid ? "CREDENTIALS_INVALID" : "OPERATOR_DISABLED", now });
      return { ok: false as const, rateLimited: blockedUntil !== null };
    }

    await client.query("DELETE FROM control.auth_rate_limits WHERE scope_hash = $1", [scopeHash]);
    const token = randomToken();
    const sessionId = crypto.randomUUID();
    const absoluteExpiresAt = new Date(now.getTime() + config.CONTROL_SESSION_ABSOLUTE_MINUTES * 60_000);
    const idleExpiresAt = new Date(Math.min(absoluteExpiresAt.getTime(), now.getTime() + config.CONTROL_SESSION_IDLE_MINUTES * 60_000));
    await client.query(`
      INSERT INTO control.operator_sessions
        (id, operator_id, token_hash, authenticated_at, created_at, last_seen_at, idle_expires_at, absolute_expires_at, user_agent_hash, ip_hash)
      VALUES ($1, $2, $3, $4, $4, $4, $5, $6, $7, $8)
    `, [sessionId, operator.id, sha256(token), now, idleExpiresAt, absoluteExpiresAt, context.userAgentHash, context.ipHash]);
    await audit(client, { requestId: context.requestId, actorOperatorId: operator.id,
      subjectHash: privacyHash(username, config.CONTROL_AUTH_ENCRYPTION_KEY), action: "auth.login", outcome: "succeeded", reasonCode: "PASSWORD_VERIFIED", now });
    return { ok: true as const, token, sessionId, operator, absoluteExpiresAt };
  });

  if (!result.ok) {
    if (result.rateLimited) throw new RateLimitError();
    throw new AuthenticationError();
  }
  const session = await loadOperatorSession(result.token, config, { requestId: context.requestId, now, touch: false });
  if (!session) throw new SessionExpiredError();
  return { token: result.token, session };
}

export async function loadOperatorSession(token: string | null, config: RuntimeConfig, options: {
  requestId: string;
  now?: Date;
  touch?: boolean;
}): Promise<OperatorSession | null> {
  if (!token || token.length < 32 || token.length > 128) return null;
  const now = options.now ?? new Date();
  return withTransaction(async client => {
    const session = (await rows<SessionRow>(client, `
      SELECT s.id, s.operator_id, s.csrf_token_hash, s.idle_expires_at, s.absolute_expires_at, s.revoked_at,
        o.username_canonical, o.display_name, o.status AS operator_status, o.access_role
      FROM control.operator_sessions s JOIN control.operators o ON o.id = s.operator_id
      WHERE s.token_hash = $1 FOR UPDATE OF s
    `, [sha256(token)]))[0];
    if (!session || session.revoked_at) return null;

    const expired = session.idle_expires_at.getTime() <= now.getTime() || session.absolute_expires_at.getTime() <= now.getTime();
    if (expired || session.operator_status !== "active" || session.access_role !== "internal_operator") {
      const reasonCode = expired ? "SESSION_EXPIRED" : "OPERATOR_DISABLED";
      await client.query(`UPDATE control.operator_sessions SET revoked_at = $2, revoked_reason = $3
        WHERE id = $1 AND revoked_at IS NULL`, [session.id, now, reasonCode]);
      await audit(client, { requestId: options.requestId, actorOperatorId: session.operator_id,
        action: "auth.session", outcome: "rejected", reasonCode, now });
      return null;
    }

    if (options.touch !== false) {
      const idleExpiry = new Date(Math.min(session.absolute_expires_at.getTime(), now.getTime() + config.CONTROL_SESSION_IDLE_MINUTES * 60_000));
      await client.query("UPDATE control.operator_sessions SET last_seen_at = $2, idle_expires_at = $3 WHERE id = $1", [session.id, now, idleExpiry]);
    }
    return {
      sessionId: session.id,
      operator: { id: session.operator_id, username: session.username_canonical, displayName: session.display_name },
      principal: { id: session.operator_id, issuer: "ruwang-control", active: true, sessionVerified: true,
        grants: await registeredInternalScopes(client, session.operator_id) },
      csrfTokenHash: session.csrf_token_hash,
      absoluteExpiresAt: session.absolute_expires_at.toISOString(),
    };
  });
}

export type ManagedInstance = { id: string; key: string; displayName: string };
export type ManagedOperator = {
  id: string;
  username: string;
  displayName: string;
  status: "active" | "disabled";
  createdAt: string;
  role: "internal_operator";
};

export async function listManagedOperators(actor: OperatorSession): Promise<{
  instances: ManagedInstance[];
  operators: ManagedOperator[];
}> {
  return withTransaction(async client => {
    await currentOperatorPrincipal(client, actor);
    const instances = await client.query<{ id: string; instance_key: string; display_name: string }>(
      "SELECT id::text, instance_key, display_name FROM control.instances ORDER BY display_name, id");
    const operators = await client.query<{
      id: string; username_canonical: string; display_name: string; status: "active" | "disabled";
      created_at: Date; access_role: "internal_operator";
    }>(`SELECT id::text, username_canonical, display_name, status, created_at, access_role
      FROM control.operators ORDER BY created_at, id`);
    return {
      instances: instances.rows.map(item => ({ id: item.id, key: item.instance_key, displayName: item.display_name })),
      operators: operators.rows.map(item => ({ id: item.id, username: item.username_canonical,
        displayName: item.display_name, status: item.status, createdAt: item.created_at.toISOString(), role: item.access_role })),
    };
  });
}

export async function createOperator(input: {
  actor: OperatorSession;
  username: string;
  displayName: string;
  password: string;
  requestId: string;
}): Promise<{ id: string; username: string }> {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username) || displayName.length < 2 || displayName.length > 160 ||
      "roles" in input || "instanceId" in input) {
    throw new RequestValidationError("OPERATOR_INPUT_INVALID");
  }
  const policyError = passwordPolicyError(input.password);
  if (policyError) throw new RequestValidationError("PASSWORD_POLICY_INVALID");
  const passwordHash = await hashPassword(input.password);
  const operatorId = crypto.randomUUID();
  try {
    await withTransaction(async client => {
      await currentOperatorPrincipal(client,input.actor);
      await client.query(`INSERT INTO control.operators (id, username_canonical, display_name, email_canonical)
        VALUES ($1, $2, $3, NULL)`, [operatorId, username, displayName]);
      await client.query(`INSERT INTO control.operator_password_credentials (operator_id, password_hash)
        VALUES ($1, $2)`, [operatorId, passwordHash]);
      await audit(client, { requestId: input.requestId, actorOperatorId: input.actor.operator.id,
        targetOperatorId: operatorId, action: "operator.create",
        outcome: "succeeded", reasonCode: "INTERNAL_OPERATOR_REQUEST", now: new Date() });
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") throw new ConflictError("USERNAME_ALREADY_EXISTS");
    throw error;
  }
  return { id: operatorId, username };
}

export async function rotateCsrfToken(session: OperatorSession): Promise<string> {
  const token = randomToken();
  const updated = await query<{ id: string }>(`
    UPDATE control.operator_sessions SET csrf_token_hash = $2 WHERE id = $1 AND revoked_at IS NULL RETURNING id::text
  `, [session.sessionId, sha256(token)]);
  if (updated.length !== 1) throw new SessionExpiredError();
  return token;
}

export function verifyCsrfToken(session: OperatorSession, token: string | null): void {
  if (!session.csrfTokenHash || !token) throw new CsrfError("TOKEN_MISSING");
  const actual = Buffer.from(sha256(token), "hex");
  const expected = Buffer.from(session.csrfTokenHash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new CsrfError("TOKEN_MISMATCH");
}

export async function logoutOperator(session: OperatorSession, requestId: string, now = new Date()): Promise<void> {
  await withTransaction(async client => {
    await client.query(`UPDATE control.operator_sessions SET revoked_at = $2, revoked_reason = 'LOGOUT'
      WHERE id = $1 AND revoked_at IS NULL`, [session.sessionId, now]);
    await audit(client, { requestId, actorOperatorId: session.operator.id,
      action: "auth.logout", outcome: "succeeded", reasonCode: "USER_REQUEST", now });
  });
}

export async function requireInstancePermission(session: OperatorSession, action: Action, instanceId: string, requestId: string): Promise<void> {
  const access = authorize(session.principal, action, instanceId);
  if (access.allowed) return;
  await withTransaction(client => audit(client, { requestId, actorOperatorId: session.operator.id,
    action: "access.denied", outcome: "denied", reasonCode: access.reason, now: new Date() }));
  throw new AuthorizationError();
}

export async function revokeOperatorSessions(input: {
  actor: OperatorSession;
  instanceId: string;
  targetOperatorId: string;
  requestId: string;
}): Promise<number> {
  if (input.actor.operator.id === input.targetOperatorId) throw new AuthorizationError();
  return withTransaction(async client => {
    await currentActionPrincipal(client, input.actor, input.instanceId, "session.revoke");
    const target = await client.query("SELECT id FROM control.operators WHERE id = $1", [input.targetOperatorId]);
    if (target.rowCount !== 1) throw new AuthorizationError();
    const result = await client.query(`UPDATE control.operator_sessions
      SET revoked_at = now(), revoked_reason = 'INTERNAL_OPERATOR_REVOKED'
      WHERE operator_id = $1 AND revoked_at IS NULL`, [input.targetOperatorId]);
    await audit(client, { requestId: input.requestId, actorOperatorId: input.actor.operator.id,
      targetOperatorId: input.targetOperatorId, instanceId: input.instanceId, action: "operator.session_revoke",
      outcome: "succeeded", reasonCode: "INTERNAL_OPERATOR_REQUEST", now: new Date() });
    return result.rowCount ?? 0;
  });
}
