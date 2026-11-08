import { Client } from "pg";

try { process.loadEnvFile?.(".env.local"); } catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const url = process.env.CONTROL_DATABASE_URL;
const expectedDatabase = process.env.CONTROL_DATABASE_NAME;
const expectedRole = process.env.CONTROL_DATABASE_RUNTIME_ROLE;
if (!url || !expectedDatabase || !expectedRole) throw new Error("Konfigurasi runtime database Control wajib diisi.");

const client = new Client({
  connectionString: url,
  ssl: process.env.CONTROL_DATABASE_SSL === "disable" ? false : { rejectUnauthorized: process.env.CONTROL_DATABASE_SSL === "verify-full" },
  application_name: "ruwang-control-database-verifier",
});

await client.connect();
try {
  const identity = (await client.query(`
    SELECT current_database() AS database, current_user AS role,
      rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
    FROM pg_roles WHERE rolname = current_user
  `)).rows[0];
  if (!identity || identity.database !== expectedDatabase || identity.role !== expectedRole ||
      identity.rolsuper || identity.rolcreatedb || identity.rolcreaterole || identity.rolbypassrls) {
    throw new Error("Identitas atau least-privilege role runtime tidak valid.");
  }

  const expectedTables = [
    "audit_events", "auth_rate_limits", "instances", "operator_grants",
    "operator_password_credentials", "operator_sessions", "operators", "review_commands", "review_snapshots",
    "security_audit_events", "service_observations", "review_reasons", "review_dispatch_attempts", "bank_ack_nonces",
    "monitor_sources", "monitor_poll_state", "monitor_response_nonces",
    "review_snapshot_nonces", "delivery_recovery_requests",
  ].sort();
  const tableRows = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'control' AND table_name <> 'schema_migrations' ORDER BY table_name");
  if (JSON.stringify(tableRows.rows.map(row => row.table_name)) !== JSON.stringify(expectedTables)) {
    throw new Error("Daftar tabel Control tidak sesuai migration yang aktif.");
  }

  const access = (await client.query(`
    SELECT
      has_schema_privilege(current_user, 'control', 'USAGE') AS schema_usage,
      has_schema_privilege(current_user, 'control', 'CREATE') AS schema_create,
      has_table_privilege(current_user, 'control.instances', 'SELECT') AS table_select,
      has_table_privilege(current_user, 'control.instances', 'INSERT') AS table_insert,
      has_table_privilege(current_user, 'control.instances', 'UPDATE') AS table_update,
      has_table_privilege(current_user, 'control.instances', 'DELETE') AS table_delete
  `)).rows[0];
  if (!access?.schema_usage || access.schema_create || !access.table_select || access.table_insert || access.table_update || access.table_delete) {
    throw new Error("Hak runtime database Control tidak least-privilege.");
  }
  const authAccess = (await client.query(`
    SELECT
      has_table_privilege(current_user, 'control.operators', 'INSERT') AS operator_insert,
      has_table_privilege(current_user, 'control.operator_password_credentials', 'INSERT') AS password_insert,
      has_table_privilege(current_user, 'control.operator_sessions', 'INSERT') AS session_insert,
      has_table_privilege(current_user, 'control.operator_sessions', 'UPDATE') AS session_update,
      has_table_privilege(current_user, 'control.security_audit_events', 'INSERT') AS audit_insert,
      has_table_privilege(current_user, 'control.auth_rate_limits', 'INSERT') AS rate_insert,
      has_table_privilege(current_user, 'control.operator_grants', 'INSERT') AS grant_insert
      ,has_table_privilege(current_user, 'control.review_commands', 'INSERT') AS command_insert
      ,has_table_privilege(current_user, 'control.review_commands', 'UPDATE') AS command_update
      ,has_table_privilege(current_user, 'control.review_reasons', 'INSERT') AS reason_insert
      ,has_table_privilege(current_user, 'control.review_dispatch_attempts', 'INSERT') AS attempt_insert
      ,has_table_privilege(current_user, 'control.bank_ack_nonces', 'INSERT') AS ack_nonce_insert
      ,has_table_privilege(current_user, 'control.instances', 'UPDATE') AS instance_update
      ,has_table_privilege(current_user, 'control.service_observations', 'INSERT') AS observation_insert
      ,has_table_privilege(current_user, 'control.service_observations', 'UPDATE') AS observation_update
      ,has_table_privilege(current_user, 'control.monitor_poll_state', 'INSERT') AS poll_insert
      ,has_table_privilege(current_user, 'control.monitor_poll_state', 'UPDATE') AS poll_update
      ,has_table_privilege(current_user, 'control.monitor_response_nonces', 'INSERT') AS monitor_nonce_insert
      ,has_table_privilege(current_user, 'control.monitor_response_nonces', 'DELETE') AS monitor_nonce_delete
      ,has_table_privilege(current_user, 'control.monitor_sources', 'INSERT') AS source_insert
      ,has_table_privilege(current_user, 'control.review_snapshot_nonces', 'INSERT') AS snapshot_nonce_insert
      ,has_table_privilege(current_user, 'control.review_snapshot_nonces', 'DELETE') AS snapshot_nonce_delete
      ,has_column_privilege(current_user, 'control.review_snapshots', 'state', 'UPDATE') AS snapshot_state_update
  `)).rows[0];
  if (!authAccess?.operator_insert || !authAccess?.password_insert || !authAccess?.session_insert || !authAccess.session_update ||
      !authAccess.audit_insert || !authAccess.rate_insert || authAccess.grant_insert || !authAccess.command_insert ||
      !authAccess.command_update || !authAccess.reason_insert ||
      !authAccess.attempt_insert || !authAccess.ack_nonce_insert || authAccess.instance_update ||
      !authAccess.observation_insert || !authAccess.observation_update || !authAccess.poll_insert || !authAccess.poll_update ||
      !authAccess.monitor_nonce_insert || !authAccess.monitor_nonce_delete || authAccess.source_insert ||
      !authAccess.snapshot_nonce_insert || !authAccess.snapshot_nonce_delete || !authAccess.snapshot_state_update) {
    throw new Error("Hak tulis runtime auth tidak sesuai allowlist.");
  }

  const counts = (await client.query(`
    SELECT
      (SELECT count(*)::int FROM control.schema_migrations) AS migrations,
      (SELECT count(*)::int FROM control.instances) AS instances,
      (SELECT count(*)::int FROM control.review_snapshots) AS reviews,
      (SELECT count(*)::int FROM control.review_commands) AS commands,
      (SELECT count(*)::int FROM control.service_observations) AS observations,
      (SELECT count(*)::int FROM control.audit_events) AS audit_events
      ,(SELECT count(*)::int FROM control.operators) AS operators
      ,(SELECT count(*)::int FROM control.operator_sessions) AS operator_sessions
      ,(SELECT count(*)::int FROM control.operator_grants) AS operator_grants
      ,(SELECT count(*)::int FROM control.security_audit_events) AS security_audit_events
      ,(SELECT count(*)::int FROM control.auth_rate_limits) AS auth_rate_limits
      ,(SELECT count(*)::int FROM control.review_reasons) AS review_reasons
      ,(SELECT count(*)::int FROM control.review_dispatch_attempts) AS review_dispatch_attempts
      ,(SELECT count(*)::int FROM control.bank_ack_nonces) AS bank_ack_nonces
      ,(SELECT count(*)::int FROM control.monitor_sources) AS monitor_sources
      ,(SELECT count(*)::int FROM control.monitor_poll_state) AS monitor_poll_state
      ,(SELECT count(*)::int FROM control.monitor_response_nonces) AS monitor_response_nonces
      ,(SELECT count(*)::int FROM control.review_snapshot_nonces) AS review_snapshot_nonces
  `)).rows[0];
  if (!counts || counts.migrations !== 16) {
    throw new Error("Jumlah migration Control tidak sesuai.");
  }

  const archive = (await client.query("SELECT has_schema_privilege(current_user,'control_audit_archive','USAGE') AS usage, has_table_privilege(current_user,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='control_audit_archive' AND c.relname='verified_subject_bindings'),'SELECT') AS identity_read, has_table_privilege(current_user,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='control_audit_archive' AND c.relname='public_observation_attempts'),'SELECT') AS observation_read")).rows[0];
  if(archive.usage || archive.identity_read || archive.observation_read)throw new Error("Retired audit must not be accessible to runtime.");

  // Read-only privilege inspection. Executed negative writes belong in the owned disposable suite.

  console.log(JSON.stringify({
    database: identity.database,
    role: identity.role,
    migrations: counts.migrations,
    records: counts,
    runtimeAccess: "read-all, auth-operator-review-monitor-write-allowlist; retired-audit-inaccessible",
    status: "verified",
  }));
} finally {
  await client.end();
}
