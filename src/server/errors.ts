import { ConfigurationError } from "../lib/env.ts";

export class DatabaseUnavailableError extends Error {
  readonly code = "DATABASE_UNAVAILABLE";
  constructor(options?: ErrorOptions) {
    super("Database Control tidak dapat dijangkau.", options);
    this.name = "DatabaseUnavailableError";
  }
}

export class SchemaNotReadyError extends Error {
  readonly code = "SCHEMA_NOT_READY";
  constructor() {
    super("Migration database Control belum lengkap.");
    this.name = "SchemaNotReadyError";
  }
}

export class AuthenticationError extends Error {
  readonly code = "AUTHENTICATION_FAILED";
  constructor() { super("Username atau password tidak valid."); this.name = "AuthenticationError"; }
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  constructor() { super("Anda tidak memiliki izin untuk tindakan ini."); this.name = "AuthorizationError"; }
}

export class SessionExpiredError extends Error {
  readonly code = "SESSION_EXPIRED";
  constructor() { super("Sesi sudah berakhir. Silakan masuk kembali."); this.name = "SessionExpiredError"; }
}

export class RateLimitError extends Error {
  readonly code = "RATE_LIMITED";
  constructor() { super("Terlalu banyak percobaan. Coba kembali beberapa saat lagi."); this.name = "RateLimitError"; }
}

export class CsrfError extends Error {
  readonly code = "CSRF_REJECTED";
  readonly reason: string;
  constructor(reason: string) { super("Permintaan keamanan tidak valid."); this.name = "CsrfError"; this.reason = reason; }
}

export class RequestValidationError extends Error {
  readonly code = "VALIDATION_FAILED";
  readonly reason: string;
  constructor(reason: string) { super("Data permintaan tidak valid."); this.name = "RequestValidationError"; this.reason = reason; }
}

export class ConflictError extends Error {
  readonly code: string;
  constructor(code = "VERSION_CONFLICT") { super(code === "USERNAME_ALREADY_EXISTS" ? "Username sudah digunakan. Pilih username lain." : "Data sumber sudah berubah. Muat ulang sebelum melanjutkan."); this.name = "ConflictError"; this.code = code; }
}

export class CommandNotFoundError extends Error {
  readonly code = "COMMAND_NOT_FOUND";
  constructor() { super("Keputusan belum tercatat di Control."); this.name = "CommandNotFoundError"; }
}

export class IntegrationUnavailableError extends Error {
  readonly code: string;
  constructor(code = "BANK_ADAPTER_UNAVAILABLE") { super("Adapter bank belum dapat dihubungi."); this.name = "IntegrationUnavailableError"; this.code = code; }
}

export type PublicError = { code: string; message: string; status: number };

export function toPublicError(error: unknown): PublicError {
  if (error instanceof CommandNotFoundError) return { code: error.code, message: error.message, status: 404 };
  if (error instanceof ConfigurationError) {
    return { code: error.code, message: "Konfigurasi Control belum lengkap.", status: 503 };
  }
  if (error instanceof SchemaNotReadyError) {
    return { code: error.code, message: error.message, status: 503 };
  }
  if (error instanceof DatabaseUnavailableError) {
    return { code: error.code, message: error.message, status: 503 };
  }
  if (error instanceof AuthenticationError || error instanceof SessionExpiredError) {
    return { code: error.code, message: error.message, status: 401 };
  }
  if (error instanceof AuthorizationError || error instanceof CsrfError) {
    return { code: error.code, message: error.message, status: 403 };
  }
  if (error instanceof RateLimitError) {
    return { code: error.code, message: error.message, status: 429 };
  }
  if (error instanceof RequestValidationError) {
    if(error.reason==="SELF_REVIEW")return {code:error.reason,message:"Anda terlibat dalam pengajuan ini.",status:400};
    return { code: error.code, message: error.message, status: 400 };
  }
  if (error instanceof ConflictError) {
    return { code: error.code, message: error.message, status: 409 };
  }
  if (error instanceof IntegrationUnavailableError) {
    return { code: error.code, message: error.message, status: 503 };
  }
  return { code: "INTERNAL_ERROR", message: "Layanan belum dapat memproses permintaan.", status: 500 };
}
