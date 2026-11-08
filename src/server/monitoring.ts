import { readFile } from "node:fs/promises";
import type { QueryResultRow } from "pg";
import { authorize, type Principal } from "@/src/domain/authorization";
import { displayStatus, monitoringBackoffSeconds, monitoringBaseUrl, monitoringSummary, type MonitoringSnapshot } from "@/src/domain/monitoring";
import { MonitoringTransportError, verifyMonitoringSnapshotResponse } from "@/src/domain/monitoring-transport";
import { createTransportSigningMessage, payloadDigest, sha256Hex, signTransport, transportHeaderNames } from "@/src/domain/control-review-contract";
import { getRuntimeConfig, type RuntimeConfig } from "@/src/lib/env";
import { query, withTransaction, type DatabaseClient } from "@/src/server/database";
import { IntegrationUnavailableError } from "@/src/server/errors";

const paths = {
  ruwang: "/api/v1/internal/ruwang-control/sj-monitoring/snapshot",
  sj_central: "/v1/internal/ruwang-control/sj-monitoring/snapshot",
} as const;
const emptyDigest = sha256Hex(Buffer.alloc(0));

type SourceRow = QueryResultRow & {
  instance_id: string; instance_key: string; display_name: string; source_kind: keyof typeof paths;
  base_url: string; audience: string; control_key_id: string; response_key_id: string;
  response_public_key: string; stale_after_seconds: number; poll_interval_seconds: number;
  consecutive_failures: number;
  poll_token: string;
};
type ObservationRow = QueryResultRow & {
  instance_id: string; service_key: string; status: "healthy" | "degraded" | "offline" | "unknown";
  observed_at: Date; source_observed_at: Date | null; detail_code: string | null; metric_value: string | null;
};

import type { MonitoringView } from "@/src/domain/monitoring-read";
export type { MonitoringView } from "@/src/domain/monitoring-read";

function monitoringTarget(source: SourceRow): string {
  return payloadDigest({ instance: source.instance_id, kind: source.source_kind, origin: source.base_url,
    audience: source.audience, key: source.response_key_id, publicKey: source.response_public_key,
    environment: getRuntimeConfig().CONTROL_APP_ENV });
}

function permittedInstanceIds(principal: Principal): string[] {
  return [...new Set(principal.grants.filter(grant => grant.active && authorize(principal, "monitoring.read", grant.instanceId).allowed).map(grant => grant.instanceId))];
}

export function assertMonitoringBaseUrl(value: string, config: RuntimeConfig): URL {
  try { return monitoringBaseUrl(value, config.CONTROL_APP_ENV === "production"); }
  catch { throw new IntegrationUnavailableError("MONITOR_SOURCE_URL_INVALID"); }
}

async function privateKey(config: RuntimeConfig): Promise<string> {
  if (!config.CONTROL_ENABLE_SJ_MONITORING || !config.CONTROL_MONITORING_SIGNING_PRIVATE_KEY_FILE || !config.CONTROL_MONITORING_SIGNING_KEY_ID) {
    throw new IntegrationUnavailableError("SJ_MONITORING_DISABLED");
  }
  const key = await readFile(config.CONTROL_MONITORING_SIGNING_PRIVATE_KEY_FILE, "utf8");
  if (key.length < 80 || key.length > 16_384 || !key.includes("PRIVATE KEY")) throw new IntegrationUnavailableError("MONITOR_SIGNING_KEY_INVALID");
  return key;
}

async function reserveSources(instanceIds: string[], config: RuntimeConfig): Promise<SourceRow[]> {
  if (instanceIds.length === 0) return [];
  return withTransaction(async client => {
    await client.query(`INSERT INTO control.monitor_poll_state (instance_id)
      SELECT instance_id FROM control.monitor_sources WHERE enabled = true AND instance_id = ANY($1::uuid[])
      ON CONFLICT (instance_id) DO NOTHING`, [instanceIds]);
    const selected = await client.query<SourceRow>(`SELECT s.instance_id::text, i.instance_key, i.display_name,
      s.source_kind, s.base_url, s.audience, s.control_key_id, s.response_key_id, s.response_public_key,
      s.stale_after_seconds, s.poll_interval_seconds, p.consecutive_failures
      FROM control.monitor_sources s JOIN control.instances i ON i.id = s.instance_id
      JOIN control.monitor_poll_state p ON p.instance_id = s.instance_id
      WHERE s.enabled = true AND i.enabled = true AND s.instance_id = ANY($1::uuid[]) AND p.next_poll_at <= now()
      ORDER BY p.next_poll_at, s.instance_id FOR UPDATE OF p SKIP LOCKED LIMIT $2`,
    [instanceIds, config.CONTROL_MONITORING_MAX_SOURCES_PER_POLL]);
    for (const source of selected.rows) {
      source.poll_token = crypto.randomUUID();
      await client.query(`UPDATE control.monitor_poll_state SET last_attempt_at = now(),
        poll_token = $3,last_attempt_target=$4,last_result_code=NULL, next_poll_at = now() + ($2::text || ' seconds')::interval, updated_at = now() WHERE instance_id = $1`,
      [source.instance_id, source.poll_interval_seconds, source.poll_token, monitoringTarget(source)]);
    }
    return selected.rows;
  });
}

async function ownsPoll(client: DatabaseClient, source: SourceRow): Promise<boolean> {
  const owned = await client.query(`SELECT p.instance_id FROM control.monitor_poll_state p
    JOIN control.monitor_sources s ON s.instance_id=p.instance_id JOIN control.instances i ON i.id=s.instance_id
    WHERE p.instance_id=$1 AND p.poll_token=$2 AND s.enabled=true AND i.enabled=true
      AND s.source_kind=$3 AND s.base_url=$4 AND s.audience=$5 AND s.control_key_id=$6
      AND s.response_key_id=$7 AND s.response_public_key=$8 FOR UPDATE OF p`,
  [source.instance_id, source.poll_token, source.source_kind, source.base_url, source.audience,
    source.control_key_id, source.response_key_id, source.response_public_key]);
  return owned.rowCount === 1;
}

async function readLimitedBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 65_536) throw new IntegrationUnavailableError("MONITOR_SOURCE_RESPONSE_TOO_LARGE");
  if (!response.body) return "";
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const item = await reader.read(); if (item.done) break;
    size += item.value.byteLength;
    if (size > 65_536) { await reader.cancel(); throw new IntegrationUnavailableError("MONITOR_SOURCE_RESPONSE_TOO_LARGE"); }
    chunks.push(item.value);
  }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(all); }
  catch { throw new IntegrationUnavailableError("MONITOR_SOURCE_RESPONSE_INVALID"); }
}

async function persistSuccess(source: SourceRow, verified: { snapshot: MonitoringSnapshot; nonce: string }, now: Date): Promise<void> {
  try { await withTransaction(async client => {
    if (!await ownsPoll(client, source)) return;
    const latest = await client.query<{ observed: Date | null }>("SELECT (last_snapshot->>'observed_at')::timestamptz AS observed FROM control.monitor_poll_state WHERE instance_id=$1 AND last_snapshot_target=$2", [source.instance_id, monitoringTarget(source)]);
    if (latest.rows[0]?.observed && latest.rows[0].observed.getTime() > Date.parse(verified.snapshot.observed_at)) {
      throw new IntegrationUnavailableError("MONITOR_RESPONSE_OUT_OF_ORDER");
    }
    await client.query("DELETE FROM control.monitor_response_nonces WHERE expires_at <= now()");
    await client.query(`INSERT INTO control.monitor_response_nonces (instance_id, key_id, nonce, expires_at)
      VALUES ($1,$2,$3,now() + interval '10 minutes')`, [source.instance_id, source.response_key_id, verified.nonce]);
    await client.query("DELETE FROM control.service_observations WHERE instance_id = $1", [source.instance_id]);
    const all = [
      { key: "source", status: monitoringSummary(verified.snapshot), detail: null, metric: null },
      ...verified.snapshot.services.map(item => ({ key: `service:${item.key}`, status: item.status, detail: item.detail_code ?? null, metric: null })),
      ...verified.snapshot.queues.map(item => ({ key: `queue:${item.key}`, status: item.status, detail: item.detail_code ?? null, metric: item.depth ?? null })),
    ];
    for (const item of all) await client.query(`INSERT INTO control.service_observations
      (instance_id, service_key, status, observed_at, source_observed_at, detail_code, metric_value)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [source.instance_id, item.key, item.status, now, verified.snapshot.observed_at, item.detail, item.metric]);
    await client.query(`UPDATE control.monitor_poll_state SET consecutive_failures = 0, last_success_at = $2,
      next_poll_at = $2::timestamptz + ($3::text || ' seconds')::interval, poll_token = NULL, last_result_code = 'OBSERVED',
      last_snapshot=$4::jsonb,last_snapshot_target=$5,updated_at = $2 WHERE instance_id = $1`,
    [source.instance_id, now, source.poll_interval_seconds, JSON.stringify(verified.snapshot), monitoringTarget(source)]);
  }); } catch (error) {
    if ((error as { code?: string })?.code === "23505") throw new IntegrationUnavailableError("MONITOR_RESPONSE_REPLAYED");
    throw error;
  }
}

async function persistFailure(source: SourceRow, status: "offline" | "unknown", code: string, now: Date, config: RuntimeConfig): Promise<void> {
  const failures = source.consecutive_failures + 1;
  const delay = monitoringBackoffSeconds(failures, source.poll_interval_seconds, config.CONTROL_MONITORING_BACKOFF_MAX_SECONDS);
  await withTransaction(async client => {
    if (!await ownsPoll(client, source)) return;
    await client.query(`INSERT INTO control.service_observations (instance_id, service_key, status, observed_at, detail_code)
      VALUES ($1,'source',$2,$3,$4) ON CONFLICT (instance_id, service_key) DO UPDATE
      SET status = EXCLUDED.status, observed_at = EXCLUDED.observed_at, source_observed_at = NULL,
          detail_code = EXCLUDED.detail_code, metric_value = NULL`, [source.instance_id, status, now, code]);
    await client.query(`UPDATE control.monitor_poll_state SET consecutive_failures = $2,
      next_poll_at = $3::timestamptz + ($4::text || ' seconds')::interval, poll_token = NULL, last_result_code = $5::text,
      last_failure_at=$3,last_failure_code=$5::text,last_failure_target=$6, updated_at = $3 WHERE instance_id = $1`,
    [source.instance_id, failures, now, delay, code, monitoringTarget(source)]);
  });
}

async function pollOne(source: SourceRow, config: RuntimeConfig, key: string): Promise<void> {
  const path = paths[source.source_kind];
  if (source.control_key_id !== config.CONTROL_MONITORING_SIGNING_KEY_ID) {
    await persistFailure(source, "unknown", "MONITOR_KEY_ID_MISMATCH", new Date(), config);
    return;
  }
  const target = new URL(path, assertMonitoringBaseUrl(source.base_url, config));
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomUUID();
  const message = createTransportSigningMessage({ method: "GET", path, timestamp, nonce, contentSha256: emptyDigest });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.CONTROL_MONITORING_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(target, { method: "GET", redirect: "error", cache: "no-store", signal: controller.signal,
      headers: { accept: "application/json", [transportHeaderNames.instanceId]: source.instance_id,
        [transportHeaderNames.keyId]: config.CONTROL_MONITORING_SIGNING_KEY_ID!, [transportHeaderNames.timestamp]: timestamp,
        [transportHeaderNames.nonce]: nonce, [transportHeaderNames.contentSha256]: emptyDigest,
        [transportHeaderNames.signature]: signTransport(message, key), "x-rc-audience": source.audience } });
    const bodyText = await readLimitedBody(response);
    let verified;
    try { verified = verifyMonitoringSnapshotResponse({ response, bodyText, source: { instanceId: source.instance_id,
      sourceKind: source.source_kind, responseKeyId: source.response_key_id, responsePublicKey: source.response_public_key }, path, now: new Date() }); }
    catch (error) { if (error instanceof MonitoringTransportError) throw new IntegrationUnavailableError(error.code); throw error; }
    await persistSuccess(source, verified, new Date());
  } catch (error) {
    const known = error instanceof IntegrationUnavailableError;
    await persistFailure(source, known ? "unknown" : "offline", known ? error.code : error instanceof Error && error.name === "AbortError" ? "SOURCE_TIMEOUT" : "SOURCE_OFFLINE", new Date(), config);
  } finally { clearTimeout(timeout); }
}

export async function pollMonitoring(principal: Principal): Promise<MonitoringView> {
  const config = getRuntimeConfig();
  const ids = permittedInstanceIds(principal);
  const key = await privateKey(config);
  const sources = await reserveSources(ids, config);
  await Promise.all(sources.map(source => pollOne(source, config, key)));
  return getMonitoringView(principal);
}

export async function getMonitoringView(principal: Principal, now = new Date()): Promise<MonitoringView> {
  const ids = permittedInstanceIds(principal);
  if (ids.length === 0) return { observedAt: now.toISOString(), enabled: getRuntimeConfig().CONTROL_ENABLE_SJ_MONITORING, sources: [] };
  const sourceRows = await query<SourceRow & { next_poll_at: Date | null; last_success_at: Date | null; last_attempt_at: Date | null;
    last_result_code: string | null; last_snapshot: MonitoringSnapshot | null; last_snapshot_target: string | null;
    last_failure_at: Date | null; last_failure_code: string | null; last_failure_target: string | null; last_attempt_target: string | null }>(`SELECT s.instance_id::text, i.instance_key, i.display_name,
    s.source_kind,s.base_url,s.audience,s.response_key_id,s.response_public_key,s.stale_after_seconds, p.next_poll_at,
    p.last_success_at,p.last_attempt_at,p.last_result_code,p.last_snapshot,p.last_snapshot_target,p.last_failure_at,p.last_failure_code,p.last_failure_target,p.last_attempt_target FROM control.monitor_sources s
    JOIN control.instances i ON i.id = s.instance_id LEFT JOIN control.monitor_poll_state p ON p.instance_id = s.instance_id
    WHERE s.instance_id = ANY($1::uuid[]) AND s.enabled = true AND i.enabled = true ORDER BY i.display_name`, [ids]);
  const observations = await query<ObservationRow>(`SELECT instance_id::text, service_key, status, observed_at,
    source_observed_at, detail_code, metric_value::text FROM control.service_observations WHERE instance_id = ANY($1::uuid[])`, [ids]);
  return { observedAt: now.toISOString(), enabled: getRuntimeConfig().CONTROL_ENABLE_SJ_MONITORING,
    sources: sourceRows.map(source => {
      const rows = observations.filter(item => item.instance_id === source.instance_id);
      const root = rows.find(item => item.service_key === "source");
      const project = (item: ObservationRow) => {
        const observedAt = item.source_observed_at ?? item.observed_at;
        return { key: item.service_key.slice(item.service_key.indexOf(":") + 1),
          status: displayStatus({ status: item.status, observedAt, staleAfterSeconds: source.stale_after_seconds, now }),
          observedAt: observedAt.toISOString(), detailCode: item.detail_code };
      };
      const target = monitoringTarget(source);
      const rootOwned = source.last_attempt_target === target && source.last_result_code !== null;
      const rootObservedAt = rootOwned && root ? root.source_observed_at ?? root.observed_at : null;
      const sameTarget = source.last_snapshot_target === target;
      const last = sameTarget ? source.last_snapshot : null;
      return { instanceId: source.instance_id, instanceKey: source.instance_key, displayName: source.display_name,
        sourceKind: source.source_kind,
        status: displayStatus({ status: rootOwned ? root?.status ?? "unknown" : "unknown", observedAt: rootObservedAt, staleAfterSeconds: source.stale_after_seconds, now }),
        observedAt: rootObservedAt?.toISOString() ?? null, nextPollAt: source.next_poll_at?.toISOString() ?? null,
        evidenceScope: "SIGNED_PIPELINE_SNAPSHOT" as const,
        lastSuccessfulCheck: last && source.last_success_at ? { checkedAt: source.last_success_at.toISOString(), sourceObservedAt: last.observed_at,
          status: displayStatus({ status: monitoringSummary(last), observedAt: new Date(last.observed_at), staleAfterSeconds: source.stale_after_seconds, now }) } : null,
        lastAttempt: source.last_attempt_target === monitoringTarget(source) && source.last_attempt_at ? { startedAt: source.last_attempt_at.toISOString(), code: source.last_result_code } : null,
        lastFailure: source.last_failure_target === monitoringTarget(source) && source.last_failure_at && source.last_failure_code ? { at: source.last_failure_at.toISOString(), code: source.last_failure_code } : null,
        services: sameTarget ? rows.filter(item => item.service_key.startsWith("service:")).map(project) : [],
        queues: sameTarget ? rows.filter(item => item.service_key.startsWith("queue:")).map(item => ({ ...project(item), depth: item.metric_value === null ? null : Number(item.metric_value) })) : [],
      };
    }) };
}
