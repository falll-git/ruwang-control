import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";
import { getRuntimeConfig, type RuntimeConfig } from "@/src/lib/env";
import { DatabaseUnavailableError, SchemaNotReadyError } from "@/src/server/errors";

const REQUIRED_TABLES = [
  "instances", "review_snapshots", "review_commands", "service_observations", "audit_events",
  "operators", "operator_password_credentials", "operator_grants",
  "operator_sessions", "auth_rate_limits", "security_audit_events",
  "review_reasons", "review_dispatch_attempts", "bank_ack_nonces",
  "monitor_sources", "monitor_poll_state", "monitor_response_nonces",
  "review_snapshot_nonces", "delivery_recovery_requests",
] as const;
type PoolGlobal = typeof globalThis & { __ruwangControlPool?: Pool };

function poolOptions(config: RuntimeConfig): PoolConfig {
  const ssl = config.CONTROL_DATABASE_SSL === "disable"
    ? false
    : { rejectUnauthorized: config.CONTROL_DATABASE_SSL === "verify-full" };
  return {
    connectionString: config.CONTROL_DATABASE_URL,
    ssl,
    max: config.CONTROL_DB_POOL_MAX,
    connectionTimeoutMillis: config.CONTROL_DB_CONNECT_TIMEOUT_MS,
    statement_timeout: config.CONTROL_DB_STATEMENT_TIMEOUT_MS,
    application_name: "ruwang-control-web",
  };
}

function getPool(): Pool {
  const globalPool = globalThis as PoolGlobal;
  if (!globalPool.__ruwangControlPool) {
    const pool = new Pool(poolOptions(getRuntimeConfig()));
    pool.on("error", error => console.error("control_database_pool_error", { name: error.name }));
    globalPool.__ruwangControlPool = pool;
  }
  return globalPool.__ruwangControlPool;
}

export type DatabaseClient = Pick<PoolClient, "query">;

export async function withTransaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function query<Row extends QueryResultRow>(text: string, values: readonly unknown[] = []): Promise<readonly Row[]> {
  try {
    const result = await getPool().query<Row>(text, [...values]);
    return result.rows;
  } catch (error) {
    if (error instanceof SchemaNotReadyError) throw error;
    throw new DatabaseUnavailableError({ cause: error });
  }
}

export type Readiness = { database: "ready"; migrations: number; checkedAt: string };

export async function checkDatabaseReadiness(): Promise<Readiness> {
  const config = getRuntimeConfig();
  const rows = await query<{ database_name: string; tables: Record<string, string | null>; migrations: string; authority_lock: string | null; dispatch_lease: boolean; poll_token: boolean; recovery_provider:boolean; recovery_binding:boolean; internal_access:boolean }>(`
    SELECT current_database() AS database_name,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='control' AND table_name='operators' AND column_name='access_role') AS internal_access,
      to_regprocedure('control.lock_review_authority(uuid,uuid)')::text AS authority_lock,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='control' AND table_name='delivery_recovery_requests' AND column_name='provider') AS recovery_provider,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='control' AND table_name='instances' AND column_name='sj_recovery_binding') AS recovery_binding,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'control' AND table_name = 'review_commands' AND column_name = 'lease_expires_at') AS dispatch_lease,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'control' AND table_name = 'monitor_poll_state' AND column_name = 'poll_token') AS poll_token,
      jsonb_build_object(
        'instances', to_regclass('control.instances'),
        'review_snapshots', to_regclass('control.review_snapshots'),
        'review_commands', to_regclass('control.review_commands'),
        'service_observations', to_regclass('control.service_observations'),
        'audit_events', to_regclass('control.audit_events')
        ,'operators', to_regclass('control.operators')
        ,'operator_password_credentials', to_regclass('control.operator_password_credentials')
        ,'operator_grants', to_regclass('control.operator_grants')
        ,'operator_sessions', to_regclass('control.operator_sessions')
        ,'auth_rate_limits', to_regclass('control.auth_rate_limits')
        ,'security_audit_events', to_regclass('control.security_audit_events')
        ,'review_reasons', to_regclass('control.review_reasons')
        ,'review_dispatch_attempts', to_regclass('control.review_dispatch_attempts')
        ,'bank_ack_nonces', to_regclass('control.bank_ack_nonces')
        ,'monitor_sources', to_regclass('control.monitor_sources')
        ,'monitor_poll_state', to_regclass('control.monitor_poll_state')
        ,'monitor_response_nonces', to_regclass('control.monitor_response_nonces')
        ,'review_snapshot_nonces', to_regclass('control.review_snapshot_nonces')
        ,'delivery_recovery_requests', to_regclass('control.delivery_recovery_requests')
      ) AS tables,
      CASE WHEN to_regclass('control.schema_migrations') IS NULL THEN '0'
        ELSE (SELECT count(*)::text FROM control.schema_migrations) END AS migrations
  `);
  const row = rows[0];
  const retirement = await query<{ ready: boolean }>(`SELECT
    EXISTS(SELECT 1 FROM control.schema_migrations WHERE name='0016_retire_identity_and_public_observation.sql')
    AND to_regclass('control.verified_subject_bindings') IS NULL
    AND to_regclass('control.public_observation_attempts') IS NULL AS ready`);
  if (!row || !retirement[0]?.ready || !row.internal_access || Number(row.migrations) < 16 || !row.recovery_provider || !row.recovery_binding || !row.authority_lock || !row.dispatch_lease || !row.poll_token || row.database_name !== config.CONTROL_DATABASE_NAME || REQUIRED_TABLES.some(table => !row.tables[table])) {
    throw new SchemaNotReadyError();
  }
  return { database: "ready", migrations: Number(row.migrations), checkedAt: new Date().toISOString() };
}
