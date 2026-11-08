import { z } from "zod";

const booleanFlag = z.enum(["true", "false"]).default("false").transform(value => value === "true");
const positiveInt = (fallback: number, maximum: number) =>
  z.coerce.number().int().positive().max(maximum).default(fallback);
const base64Key = z.string().refine(value => {
  try { return Buffer.from(value, "base64").length === 32; } catch { return false; }
}, "wajib kunci base64 32 byte");

export const runtimeEnvSchema = z.object({
  CONTROL_APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  CONTROL_RELEASE: z.string().regex(/^(development|test|[a-f0-9]{40})$/).default("development"),
  CONTROL_DATABASE_NAME: z.string().regex(/^ruwang_control(?:_[a-z0-9]+)*$/),
  CONTROL_DATABASE_RUNTIME_ROLE: z.string().regex(/^ruwang_control_runtime(?:_[a-z0-9]+)*$/),
  CONTROL_DATABASE_URL: z.string().url().refine(value => value.startsWith("postgresql://"), "wajib URL PostgreSQL"),
  CONTROL_DATABASE_SSL: z.enum(["disable", "require", "verify-full"]).default("disable"),
  CONTROL_DB_POOL_MAX: positiveInt(5, 20),
  CONTROL_DB_CONNECT_TIMEOUT_MS: positiveInt(3000, 30_000),
  CONTROL_DB_STATEMENT_TIMEOUT_MS: positiveInt(5000, 60_000),
  CONTROL_PUBLIC_ORIGIN: z.string().url(),
  CONTROL_AUTH_ENCRYPTION_KEY: base64Key,
  CONTROL_SESSION_ABSOLUTE_MINUTES: positiveInt(480, 1_440),
  CONTROL_SESSION_IDLE_MINUTES: positiveInt(30, 240),
  CONTROL_LOGIN_RATE_WINDOW_SECONDS: positiveInt(900, 3_600),
  CONTROL_LOGIN_RATE_MAX_ATTEMPTS: positiveInt(5, 20),
  CONTROL_TRUST_PROXY: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  CONTROL_ENABLE_BANK_INTEGRATION: booleanFlag,
  CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE: z.string().optional(),
  CONTROL_BANK_SIGNING_KEY_ID: z.string().regex(/^[A-Za-z0-9._-]{2,100}$/).optional(),
  CONTROL_BANK_COMMAND_TTL_SECONDS: positiveInt(60, 300),
  CONTROL_BANK_REQUEST_TIMEOUT_MS: positiveInt(5000, 30_000),
  CONTROL_ENABLE_SJ_MONITORING: booleanFlag,
  CONTROL_ENABLE_SJ_RECOVERY: booleanFlag,
  CONTROL_MONITORING_SIGNING_PRIVATE_KEY_FILE: z.string().optional(),
  CONTROL_MONITORING_SIGNING_KEY_ID: z.string().regex(/^[A-Za-z0-9._-]{2,100}$/).optional(),
  CONTROL_MONITORING_REQUEST_TIMEOUT_MS: positiveInt(5000, 30_000),
  CONTROL_MONITORING_MAX_SOURCES_PER_POLL: positiveInt(5, 5),
  CONTROL_MONITORING_BACKOFF_MAX_SECONDS: positiveInt(900, 3600),
  CONTROL_ENABLE_BANK_ACCOUNTS: z.literal("false").default("false").transform(() => false),
  CONTROL_ENABLE_GENERAL_MONITORING: z.literal("false").default("false").transform(() => false),
}).superRefine((value, context) => {
  let databaseName = "";
  try {
    databaseName = decodeURIComponent(new URL(value.CONTROL_DATABASE_URL).pathname.slice(1));
  } catch {
    return;
  }
  if (databaseName !== value.CONTROL_DATABASE_NAME) {
    context.addIssue({ code: "custom", path: ["CONTROL_DATABASE_URL"], message: "nama database tidak sama dengan CONTROL_DATABASE_NAME" });
  }
  if (decodeURIComponent(new URL(value.CONTROL_DATABASE_URL).username) !== value.CONTROL_DATABASE_RUNTIME_ROLE) {
    context.addIssue({ code: "custom", path: ["CONTROL_DATABASE_URL"], message: "role URL runtime tidak sama dengan CONTROL_DATABASE_RUNTIME_ROLE" });
  }
  if (value.CONTROL_APP_ENV === "production" && !/^[a-f0-9]{40}$/.test(value.CONTROL_RELEASE)) {
    context.addIssue({ code: "custom", path: ["CONTROL_RELEASE"], message: "production wajib memakai commit SHA 40 karakter" });
  }
  if (value.CONTROL_SESSION_IDLE_MINUTES > value.CONTROL_SESSION_ABSOLUTE_MINUTES) {
    context.addIssue({ code: "custom", path: ["CONTROL_SESSION_IDLE_MINUTES"], message: "idle expiry tidak boleh melewati absolute expiry" });
  }
  if (value.CONTROL_APP_ENV === "production" && !value.CONTROL_PUBLIC_ORIGIN.startsWith("https://")) {
    context.addIssue({ code: "custom", path: ["CONTROL_PUBLIC_ORIGIN"], message: "production wajib memakai origin HTTPS" });
  }
  if (value.CONTROL_ENABLE_BANK_INTEGRATION || value.CONTROL_ENABLE_SJ_RECOVERY) {
    if (!value.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE) {
      context.addIssue({ code: "custom", path: ["CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE"], message: "wajib saat integrasi bank aktif" });
    }
    if (!value.CONTROL_BANK_SIGNING_KEY_ID) {
      context.addIssue({ code: "custom", path: ["CONTROL_BANK_SIGNING_KEY_ID"], message: "wajib saat integrasi bank aktif" });
    }
  }
  if (value.CONTROL_ENABLE_SJ_MONITORING) {
    if (!value.CONTROL_MONITORING_SIGNING_PRIVATE_KEY_FILE) {
      context.addIssue({ code: "custom", path: ["CONTROL_MONITORING_SIGNING_PRIVATE_KEY_FILE"], message: "wajib saat monitoring SJ aktif" });
    }
    if (!value.CONTROL_MONITORING_SIGNING_KEY_ID) {
      context.addIssue({ code: "custom", path: ["CONTROL_MONITORING_SIGNING_KEY_ID"], message: "wajib saat monitoring SJ aktif" });
    }
  }
  if (value.CONTROL_APP_ENV === "production" && value.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE && !/^([A-Za-z]:\\|\/)/.test(value.CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE)) {
    context.addIssue({ code: "custom", path: ["CONTROL_BANK_SIGNING_PRIVATE_KEY_FILE"], message: "production wajib memakai absolute path" });
  }
  if (value.CONTROL_APP_ENV === "production" && value.CONTROL_MONITORING_SIGNING_PRIVATE_KEY_FILE && !/^([A-Za-z]:\\|\/)/.test(value.CONTROL_MONITORING_SIGNING_PRIVATE_KEY_FILE)) {
    context.addIssue({ code: "custom", path: ["CONTROL_MONITORING_SIGNING_PRIVATE_KEY_FILE"], message: "production wajib memakai absolute path" });
  }
});

export type RuntimeConfig = z.infer<typeof runtimeEnvSchema>;

export class ConfigurationError extends Error {
  readonly code = "CONFIGURATION_INVALID";
  readonly fields: readonly string[];
  constructor(fields: readonly string[]) {
    super("Konfigurasi aplikasi belum valid.");
    this.name = "ConfigurationError";
    this.fields = fields;
  }
}

export function parseRuntimeConfig(input: Record<string, string | undefined>): RuntimeConfig {
  const result = runtimeEnvSchema.safeParse(input);
  if (!result.success) {
    throw new ConfigurationError([...new Set(result.error.issues.map(issue => String(issue.path[0] ?? "environment")))]);
  }
  return result.data;
}

let cached: RuntimeConfig | undefined;
export function getRuntimeConfig(): RuntimeConfig {
  cached ??= parseRuntimeConfig(process.env);
  return cached;
}

export function getPublicRelease(): string {
  const result = z.string().regex(/^(development|test|[a-f0-9]{40})$/).safeParse(process.env.CONTROL_RELEASE ?? "development");
  return result.success ? result.data : "unknown";
}
