import { readFileSync } from "node:fs";
import type { ClientConfig } from "pg";

export const controlDatabaseSslModes = ["disable", "require", "verify-full"] as const;
type ControlDatabaseSslMode = typeof controlDatabaseSslModes[number];

const certificateOptions = { sslrootcert: "ca", sslcert: "cert", sslkey: "key" } as const;
const tlsParameters = new Set(["ssl", "sslmode", "sslnegotiation", "uselibpqcompat", ...Object.keys(certificateOptions)]);
type ConnectionPlan = {
  connectionString: string;
  mode: ControlDatabaseSslMode;
  certificatePaths: { field: typeof certificateOptions[keyof typeof certificateOptions]; path: string }[];
  sslnegotiation: ClientConfig["sslnegotiation"];
};

function invalidTlsSettings(): never {
  throw new Error("Parameter TLS URL tidak sesuai dengan CONTROL_DATABASE_SSL.");
}

export function planControlDatabaseConnection(connectionString: string, inputMode = "disable"): ConnectionPlan {
  const mode = controlDatabaseSslModes.find(value => value === inputMode);
  if (!mode) throw new Error("CONTROL_DATABASE_SSL harus disable, require, atau verify-full.");

  let url: URL;
  try { url = new URL(connectionString); }
  catch { throw new Error("URL database Control tidak valid."); }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("URL database Control wajib menggunakan PostgreSQL.");
  }

  const params = new Map<string, string>();
  for (const [name, value] of url.searchParams) {
    const key = name.toLowerCase();
    if (!(key.startsWith("ssl") || key === "uselibpqcompat")) continue;
    if (name !== key || !tlsParameters.has(key) || params.has(key) || !value.trim()) invalidTlsSettings();
    params.set(key, value);
  }

  const compatibility = params.get("uselibpqcompat");
  if (compatibility !== undefined && compatibility !== "true" && compatibility !== "false") invalidTlsSettings();
  const uriMode = params.get("sslmode");
  const uriSsl = params.get("ssl");
  let declaredMode: ControlDatabaseSslMode | undefined;
  if (uriMode !== undefined && uriSsl !== undefined) invalidTlsSettings();
  if (uriMode !== undefined) {
    if (uriMode === "disable" || uriMode === "verify-full") declaredMode = uriMode;
    else if (["prefer", "require", "verify-ca"].includes(uriMode) && compatibility !== "true") declaredMode = "verify-full";
    else if (uriMode === "no-verify" && compatibility !== "true") declaredMode = "require";
    else if (uriMode === "require" && compatibility === "true" && !params.has("sslrootcert")) declaredMode = "require";
    else invalidTlsSettings();
  }
  if (uriSsl !== undefined) {
    if (uriSsl === "0") declaredMode = "disable";
    else if (uriSsl === "1" || uriSsl === "true") declaredMode = "verify-full";
    else if (uriSsl === "no-verify") declaredMode = "require";
    else invalidTlsSettings();
  }
  if (declaredMode !== undefined && declaredMode !== mode) invalidTlsSettings();

  const certificatePaths = Object.entries(certificateOptions).flatMap(([parameter, field]) => {
    const path = params.get(parameter);
    return path === undefined ? [] : [{ field, path }];
  });
  if (certificatePaths.length && (mode === "disable" || (mode === "require" && (uriSsl !== undefined || declaredMode !== mode)))) invalidTlsSettings();

  const sslnegotiation = params.get("sslnegotiation");
  if (sslnegotiation !== undefined && sslnegotiation !== "postgres" && sslnegotiation !== "direct") invalidTlsSettings();
  if (sslnegotiation === "direct" && (mode === "disable" || (mode === "require" && declaredMode !== mode))) invalidTlsSettings();

  // pg reparses the DSN after merging options. Keep TLS authority in the resolved options.
  for (const name of params.keys()) url.searchParams.delete(name);
  return { connectionString: params.size ? url.href : connectionString, mode, certificatePaths, sslnegotiation };
}

export function controlDatabaseConnection(connectionString: string, mode?: string): ClientConfig {
  const plan = planControlDatabaseConnection(connectionString, mode);
  const ssl = plan.mode === "disable" ? false : { rejectUnauthorized: plan.mode === "verify-full" };
  if (ssl) {
    try {
      for (const { field, path } of plan.certificatePaths) Object.assign(ssl, { [field]: readFileSync(path, "utf8") });
    } catch {
      throw new Error("Berkas sertifikat TLS database Control tidak dapat dibaca.");
    }
  }
  return {
    connectionString: plan.connectionString,
    ssl,
    ...(plan.sslnegotiation === undefined ? {} : { sslnegotiation: plan.sslnegotiation }),
  };
}
