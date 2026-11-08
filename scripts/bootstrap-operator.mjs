import { Client } from "pg";
import {
  passwordPolicyError,
} from "../src/server/auth/crypto.ts";
import { bootstrapFirstOperator } from "../src/server/auth/bootstrap.ts";

try { process.loadEnvFile?.(".env.local"); } catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function argumentsFor(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

async function hiddenPrompt(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Bootstrap wajib dijalankan pada terminal interaktif; password tidak diterima melalui argumen atau environment.");
  }
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => { process.stdin.off("data", onData); process.stdin.setRawMode(false); process.stdin.pause(); };
    const onData = character => {
      if (character === "\u0003") { cleanup(); process.stdout.write("\n"); reject(new Error("Bootstrap dibatalkan.")); return; }
      if (character === "\r" || character === "\n") { cleanup(); process.stdout.write("\n"); resolve(value); return; }
      if (character === "\u007f" || character === "\b") { value = value.slice(0, -1); return; }
      if (/^[\x20-\x7E]+$/.test(character)) value += character;
    };
    process.stdin.on("data", onData);
  });
}

const username = argument("--username")?.trim().toLowerCase();
const displayName = argument("--name")?.trim();
const instanceKeys = [...new Set(argumentsFor("--instance-key").map(value => value.trim()).filter(Boolean))];
if (!username || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) throw new Error("Gunakan --username sepanjang 3-64 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.");
if (!displayName || displayName.length < 2 || displayName.length > 160) throw new Error("Gunakan --name sepanjang 2-160 karakter.");
// Optional keys validate the intended registry, not per-account role allocation.

const migrationUrl = process.env.CONTROL_MIGRATION_DATABASE_URL;
const expectedDatabase = process.env.CONTROL_DATABASE_NAME;
const expectedRole = process.env.CONTROL_DATABASE_MIGRATION_ROLE;
const encryptionKey = process.env.CONTROL_AUTH_ENCRYPTION_KEY;
if (!migrationUrl || !expectedDatabase || !expectedRole || !encryptionKey) throw new Error("Konfigurasi bootstrap Control belum lengkap.");
const parsedUrl = new URL(migrationUrl);
if (decodeURIComponent(parsedUrl.pathname.slice(1)) !== expectedDatabase || decodeURIComponent(parsedUrl.username) !== expectedRole) {
  throw new Error("Bootstrap menolak database atau role di luar konfigurasi migration Control.");
}

const client = new Client({ connectionString: migrationUrl, ssl: process.env.CONTROL_DATABASE_SSL === "disable" ? false : { rejectUnauthorized: process.env.CONTROL_DATABASE_SSL === "verify-full" } });
await client.connect();
try {
  const identity = (await client.query("SELECT current_database() AS database, current_user AS role")).rows[0];
  if (identity?.database !== expectedDatabase || identity?.role !== expectedRole) throw new Error("Identitas database bootstrap tidak sesuai.");
  const password = await hiddenPrompt("Password operator: ");
  const confirmation = await hiddenPrompt("Ulangi password: ");
  if (password !== confirmation) throw new Error("Konfirmasi password tidak sama.");
  const policyError = passwordPolicyError(password);
  if (policyError) throw new Error(policyError);

  const result = await bootstrapFirstOperator(client, { username, displayName, password, instanceKeys, encryptionKey });
  console.log(JSON.stringify({ operatorId: result.operatorId, instances: result.instanceCount, status: "created" }));
} finally { await client.end(); }
