import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const action = process.argv[2] ?? "status";
const root = resolve(import.meta.dirname, "..");
const dataDirectory = resolve(root, ".control-postgres", "data");
const runtimeDirectory = resolve(root, ".control-runtime");
const stateFile = resolve(runtimeDirectory, "local-postgres.json");
const logFile = resolve(runtimeDirectory, "postgres.log");
const envFile = resolve(root, ".env.local");
const port = 55432;
const host = "127.0.0.1";
const database = "ruwang_control";
const ownerRole = "ruwang_control_owner";
const migrationRole = "ruwang_control_migration";
const runtimeRole = "ruwang_control_runtime";
const pgBin = process.env.PG_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const executable = name => resolve(pgBin, process.platform === "win32" ? `${name}.exe` : name);
const run = (name, args, options = {}) => execFileSync(executable(name), args, { stdio: "pipe", encoding: "utf8", ...options });
const exists = async path => { try { await access(path, constants.F_OK); return true; } catch { return false; } };
const secret = () => randomBytes(32).toString("base64url");
const sqlLiteral = value => `'${value.replaceAll("'", "''")}'`;

async function readState() {
  if (!await exists(stateFile)) throw new Error("Klaster Control belum disiapkan. Jalankan npm run db:local:setup.");
  return JSON.parse(await readFile(stateFile, "utf8"));
}

function serverOptions() { return `-h ${host} -p ${port}`; }
function isRunning() {
  try { run("pg_ctl", ["-D", dataDirectory, "status"]); return true; } catch { return false; }
}

async function start() {
  await readState();
  if (!isRunning()) run("pg_ctl", ["-D", dataDirectory, "-l", logFile, "-o", serverOptions(), "start", "-w"], { stdio: "ignore" });
  console.log(JSON.stringify({ database, host, port, status: "running" }));
}

async function setup() {
  await mkdir(runtimeDirectory, { recursive: true });
  await mkdir(resolve(root, ".control-postgres"), { recursive: true });
  if (!await exists(stateFile)) {
    if (await exists(dataDirectory)) throw new Error("Direktori database parsial ditemukan; periksa sebelum mengulang setup.");
    const state = { ownerPassword: secret(), migrationPassword: secret(), runtimePassword: secret(), authEncryptionKey: randomBytes(32).toString("base64") };
    const passwordFile = resolve(runtimeDirectory, "initdb-password.tmp");
    await writeFile(passwordFile, state.ownerPassword, { mode: 0o600 });
    try {
      run("initdb", ["-D", dataDirectory, "--username", ownerRole, "--pwfile", passwordFile, "--auth-local=scram-sha-256", "--auth-host=scram-sha-256", "--encoding=UTF8", "--locale=C"]);
    } finally {
      await rm(passwordFile, { force: true });
    }
    await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
    try { await chmod(stateFile, 0o600); } catch { /* Windows ACL remains user-scoped by profile. */ }
  }
  await start();
  const state = await readState();
  if (!state.authEncryptionKey) {
    state.authEncryptionKey = randomBytes(32).toString("base64");
    await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
    try { await chmod(stateFile, 0o600); } catch { /* Windows ACL remains user-scoped by profile. */ }
  }
  const owner = new Client({ host, port, database: "postgres", user: ownerRole, password: state.ownerPassword });
  await owner.connect();
  try {
    const roles = await owner.query("SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])", [[migrationRole, runtimeRole]]);
    const present = new Set(roles.rows.map(row => row.rolname));
    if (!present.has(migrationRole)) await owner.query(`CREATE ROLE ${migrationRole} LOGIN PASSWORD ${sqlLiteral(state.migrationPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    if (!present.has(runtimeRole)) await owner.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD ${sqlLiteral(state.runtimePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    const databases = await owner.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (databases.rowCount === 0) await owner.query(`CREATE DATABASE ${database} OWNER ${migrationRole}`);
    await owner.query(`REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`);
    await owner.query(`GRANT CONNECT ON DATABASE ${database} TO ${migrationRole}, ${runtimeRole}`);
  } finally {
    await owner.end();
  }
  const encode = encodeURIComponent;
  const env = [
    "CONTROL_APP_ENV=development",
    "CONTROL_RELEASE=development",
    `CONTROL_DATABASE_NAME=${database}`,
    `CONTROL_DATABASE_RUNTIME_ROLE=${runtimeRole}`,
    `CONTROL_DATABASE_MIGRATION_ROLE=${migrationRole}`,
    `CONTROL_DATABASE_URL=postgresql://${runtimeRole}:${encode(state.runtimePassword)}@${host}:${port}/${database}`,
    `CONTROL_MIGRATION_DATABASE_URL=postgresql://${migrationRole}:${encode(state.migrationPassword)}@${host}:${port}/${database}`,
    "CONTROL_DATABASE_SSL=disable",
    "CONTROL_DB_POOL_MAX=5",
    "CONTROL_DB_CONNECT_TIMEOUT_MS=3000",
    "CONTROL_DB_STATEMENT_TIMEOUT_MS=5000",
    "CONTROL_PUBLIC_ORIGIN=http://127.0.0.1:4320",
    `CONTROL_AUTH_ENCRYPTION_KEY=${state.authEncryptionKey}`,
    "CONTROL_SESSION_ABSOLUTE_MINUTES=480",
    "CONTROL_SESSION_IDLE_MINUTES=30",
    "CONTROL_LOGIN_RATE_WINDOW_SECONDS=900",
    "CONTROL_LOGIN_RATE_MAX_ATTEMPTS=5",
    "CONTROL_TRUST_PROXY=false",
    "CONTROL_ENABLE_BANK_INTEGRATION=false",
    "CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE=",
    "CONTROL_BANK_SIGNING_KEY_ID=",
    "CONTROL_BANK_COMMAND_TTL_SECONDS=60",
    "CONTROL_BANK_REQUEST_TIMEOUT_MS=5000",
    "CONTROL_ENABLE_SJ_MONITORING=false",
    "CONTROL_MONITORING_SIGNING_PRIVATE_KEY_FILE=",
    "CONTROL_MONITORING_SIGNING_KEY_ID=",
    "CONTROL_MONITORING_REQUEST_TIMEOUT_MS=5000",
    "CONTROL_MONITORING_MAX_SOURCES_PER_POLL=5",
    "CONTROL_MONITORING_BACKOFF_MAX_SECONDS=900",
    "CONTROL_ENABLE_BANK_ACCOUNTS=false",
    "CONTROL_ENABLE_GENERAL_MONITORING=false",
    "",
  ].join("\n");
  await writeFile(envFile, env, { mode: 0o600 });
  try { await chmod(envFile, 0o600); } catch { /* Windows ACL remains user-scoped by profile. */ }
  console.log(JSON.stringify({ database, roles: [migrationRole, runtimeRole], env: ".env.local", status: "prepared" }));
}

async function stop() {
  if (!await exists(dataDirectory) || !isRunning()) {
    console.log(JSON.stringify({ database, status: "stopped" }));
    return;
  }
  run("pg_ctl", ["-D", dataDirectory, "stop", "-m", "fast", "-w"]);
  console.log(JSON.stringify({ database, status: "stopped" }));
}

if (!["setup", "start", "stop", "status"].includes(action)) throw new Error("Aksi database lokal tidak dikenal.");
if (action === "setup") await setup();
if (action === "start") await start();
if (action === "stop") await stop();
if (action === "status") console.log(JSON.stringify({ database, host, port, status: isRunning() ? "running" : "stopped" }));
