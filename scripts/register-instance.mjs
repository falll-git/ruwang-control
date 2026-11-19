import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { controlDatabaseConnection } from "../src/lib/database-connection.ts";

try { process.loadEnvFile?.(".env.local"); } catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const instanceKey = argument("--instance-key")?.trim().toLowerCase();
const displayName = argument("--name")?.trim();
if (!instanceKey || !/^[a-z0-9][a-z0-9_-]{1,99}$/.test(instanceKey)) throw new Error("Instance key tidak valid.");
if (!displayName || displayName.length < 2 || displayName.length > 200) throw new Error("Nama instansi harus 2-200 karakter.");

const migrationUrl = process.env.CONTROL_MIGRATION_DATABASE_URL;
const expectedDatabase = process.env.CONTROL_DATABASE_NAME;
const expectedRole = process.env.CONTROL_DATABASE_MIGRATION_ROLE;
if (!migrationUrl || !expectedDatabase || !expectedRole) throw new Error("Konfigurasi database migration Control belum lengkap.");
const parsed = new URL(migrationUrl);
if (decodeURIComponent(parsed.pathname.slice(1)) !== expectedDatabase || decodeURIComponent(parsed.username) !== expectedRole) {
  throw new Error("Registrasi menolak database atau role di luar Control.");
}

const client = new Client(controlDatabaseConnection(migrationUrl, process.env.CONTROL_DATABASE_SSL));
await client.connect();
try {
  const result = await client.query(`INSERT INTO control.instances
    (id, instance_key, display_name, review_authority, enabled)
    VALUES ($1, $2, $3, 'local', false)
    ON CONFLICT (instance_key) DO NOTHING
    RETURNING id::text`, [randomUUID(), instanceKey, displayName]);
  if (result.rowCount !== 1) throw new Error("Instance key sudah terdaftar; tidak ada data yang diubah.");
  console.log(JSON.stringify({ instanceKey, displayName, authority: "local", enabled: false, status: "created" }));
} finally { await client.end(); }
