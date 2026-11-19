import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { controlDatabaseConnection, planControlDatabaseConnection } from "../src/lib/database-connection.ts";

try { process.loadEnvFile?.(".env.local"); } catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const migrationUrl = process.env.CONTROL_MIGRATION_DATABASE_URL;
const runtimeUrl = process.env.CONTROL_DATABASE_URL;
const expectedName = process.env.CONTROL_DATABASE_NAME;
const migrationRole = process.env.CONTROL_DATABASE_MIGRATION_ROLE;
const runtimeRole = process.env.CONTROL_DATABASE_RUNTIME_ROLE;
if (!migrationUrl || !runtimeUrl || !expectedName || !migrationRole || !runtimeRole) {
  throw new Error("Konfigurasi database migration dan runtime wajib diisi.");
}
const identifierPattern = /^ruwang_control_[a-z0-9_]+$/;
if (!identifierPattern.test(migrationRole) || !identifierPattern.test(runtimeRole) || migrationRole === runtimeRole) {
  throw new Error("Role migration dan runtime harus berbeda serta memakai namespace Control.");
}
const parsed = new URL(migrationUrl);
const parsedRuntime = new URL(runtimeUrl);
if (parsed.protocol !== "postgresql:" || parsedRuntime.protocol !== "postgresql:" ||
    decodeURIComponent(parsed.pathname.slice(1)) !== expectedName ||
    decodeURIComponent(parsedRuntime.pathname.slice(1)) !== expectedName ||
    decodeURIComponent(parsed.username) !== migrationRole ||
    decodeURIComponent(parsedRuntime.username) !== runtimeRole) {
  throw new Error("Target migration tidak sama dengan CONTROL_DATABASE_NAME.");
}
const quoteIdentifier = value => `"${value.replaceAll('"', '""')}"`;

const sslMode = process.env.CONTROL_DATABASE_SSL;
planControlDatabaseConnection(runtimeUrl, sslMode);
const client = new Client({
  ...controlDatabaseConnection(migrationUrl, sslMode),
  application_name: "ruwang-control-migrator",
});
const directory = resolve("migrations");
const files = (await readdir(directory)).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
if (!files.length) throw new Error("Tidak ada migration Control.");

await client.connect();
try {
  const identity = await client.query("SELECT current_database() AS name, current_user AS role");
  if (identity.rows[0]?.name !== expectedName || identity.rows[0]?.role !== migrationRole) {
    throw new Error("Database atau role migration aktif tidak sesuai target.");
  }
  const runtimeRoleExists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [runtimeRole]);
  if (runtimeRoleExists.rowCount !== 1) throw new Error("Role runtime Control belum tersedia.");
  if (!process.argv.includes('--status')) {
    await client.query("CREATE SCHEMA IF NOT EXISTS control");
    await client.query(`CREATE TABLE IF NOT EXISTS control.schema_migrations (
    name varchar(180) PRIMARY KEY,
    checksum char(64) NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  }
  const ledgerExists=(await client.query("SELECT to_regclass('control.schema_migrations') AS ledger")).rows[0].ledger;
  const applied = new Map(ledgerExists?(await client.query("SELECT name, checksum FROM control.schema_migrations ORDER BY name")).rows.map(row => [row.name, row.checksum]):[]);
  for (const file of files) {
    const sql = await readFile(resolve(directory, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (applied.has(file)) {
      if (applied.get(file) !== checksum) throw new Error(`Checksum migration berubah: ${file}`);
      continue;
    }
    if (process.argv.includes("--status")) continue;
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO control.schema_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
      await client.query("COMMIT");
      applied.set(file, checksum);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  if (!process.argv.includes("--status")) {
    const runtime = quoteIdentifier(runtimeRole);
    const owner = quoteIdentifier(migrationRole);
    await client.query("BEGIN");
    try {
      await client.query("REVOKE ALL ON SCHEMA control FROM PUBLIC");
      await client.query(`GRANT USAGE ON SCHEMA control TO ${runtime}`);
      await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA control TO ${runtime}`);
      await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA control GRANT SELECT ON TABLES TO ${runtime}`);
      if (files.includes("0002_operator_auth.sql")) {
        await client.query(`GRANT INSERT, UPDATE ON control.operator_sessions TO ${runtime}`);
        await client.query(`GRANT INSERT, UPDATE, DELETE ON control.auth_rate_limits TO ${runtime}`);
        await client.query(`GRANT INSERT ON control.security_audit_events TO ${runtime}`);
        await client.query(`GRANT INSERT, UPDATE ON control.operator_grants TO ${runtime}`);
      }
      if (files.includes("0006_password_only_operator_access.sql")) {
        await client.query(`GRANT INSERT ON control.operators TO ${runtime}`);
        await client.query(`GRANT INSERT ON control.operator_password_credentials TO ${runtime}`);
      }
      if (files.includes("0014_single_internal_role.sql")) {
        await client.query(`REVOKE INSERT, UPDATE, DELETE ON control.operator_grants FROM ${runtime}`);
      }
      if (files.includes("0015_verified_subject_bindings.sql") && !files.includes("0016_retire_identity_and_public_observation.sql")) {
        await client.query(`GRANT INSERT, UPDATE ON control.verified_subject_bindings TO ${runtime}`);
      }
      if (files.includes("0003_bank_review_adapter.sql")) {
        await client.query(`GRANT INSERT ON control.review_reasons TO ${runtime}`);
        await client.query(`GRANT INSERT, UPDATE ON control.review_commands TO ${runtime}`);
        await client.query(`GRANT INSERT, UPDATE ON control.review_dispatch_attempts TO ${runtime}`);
        await client.query(`GRANT INSERT, DELETE ON control.bank_ack_nonces TO ${runtime}`);
        await client.query(`GRANT INSERT ON control.audit_events TO ${runtime}`);
      }
      if (files.includes("0004_sj_monitoring.sql")) {
        await client.query(`GRANT INSERT, UPDATE, DELETE ON control.service_observations TO ${runtime}`);
        await client.query(`GRANT INSERT, UPDATE ON control.monitor_poll_state TO ${runtime}`);
        await client.query(`GRANT INSERT, DELETE ON control.monitor_response_nonces TO ${runtime}`);
      }
      if (files.includes("0005_private_review_snapshots.sql")) {
        await client.query(`GRANT INSERT, DELETE ON control.review_snapshot_nonces TO ${runtime}`);
        await client.query(`GRANT INSERT ON control.review_snapshots TO ${runtime}`);
        await client.query(`GRANT UPDATE (state) ON control.review_snapshots TO ${runtime}`);
      }
      if (files.includes("0008_review_authority_lock.sql")) {
        await client.query(`GRANT EXECUTE ON FUNCTION control.lock_review_authority(uuid, uuid) TO ${runtime}`);
      }
      if (files.includes("0011_monitoring_evidence.sql") && !files.includes("0016_retire_identity_and_public_observation.sql")) {
        await client.query(`GRANT INSERT ON control.public_observation_attempts TO ${runtime}`);
        await client.query(`GRANT UPDATE (finished_at, result) ON control.public_observation_attempts TO ${runtime}`);
        await client.query(`GRANT USAGE ON SEQUENCE control.public_observation_attempts_id_seq TO ${runtime}`);
      }
      if (files.includes("0012_delivery_recovery.sql")) {
        await client.query(`GRANT INSERT ON control.delivery_recovery_requests TO ${runtime}`);
        await client.query(`GRANT UPDATE (state,result_json,updated_at) ON control.delivery_recovery_requests TO ${runtime}`);
      }
      if (files.includes("0016_retire_identity_and_public_observation.sql")) {
        await client.query(`REVOKE ALL ON SCHEMA control_audit_archive FROM ${runtime}`);
        await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA control_audit_archive FROM ${runtime}`);
        await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA control_audit_archive FROM ${runtime}`);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  const remaining = files.filter(file => !applied.has(file));
  if (process.argv.includes("--status")) {
    console.log(JSON.stringify({ database: expectedName, applied: applied.size, pending: remaining }));
  } else {
    console.log(JSON.stringify({ database: expectedName, migrations: files.length, status: "up-to-date" }));
  }
} finally {
  await client.end();
}
