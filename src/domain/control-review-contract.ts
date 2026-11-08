import { createHash, sign, verify, type KeyLike } from "node:crypto";
import { z } from "zod";

const sha256Pattern = /^[a-f0-9]{64}$/;
const qualifiedSubjectPattern = /^[a-z0-9][a-z0-9_-]{1,39}:[^\r\n]{1,180}$/;
const operatorSubjectPattern = /^ruwang-control:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const resultCodePattern = /^[A-Z][A-Z0-9_]{1,79}$/;

const resourceSchema = z.object({
  kind: z.enum(["publication", "profile", "contact", "change_request"]),
  id: z.string().uuid(),
}).strict();

export const reviewCommandSchema = z.object({
  contract_version: z.literal(1),
  command_id: z.string().uuid(),
  instance_id: z.string().uuid(),
  actor_subject: z.string().regex(operatorSubjectPattern),
  audience: z.string().min(1).max(150),
  resource: resourceSchema,
  decision: z.enum(["approve", "request_revision", "reject"]),
  contributor_subjects: z.array(z.string().regex(qualifiedSubjectPattern)).min(1).max(20).refine(values => new Set(values).size === values.length),
  reason: z.string().max(2000).optional(),
  expected_version: z.number().int().min(0),
  expected_checksum: z.string().regex(sha256Pattern),
  issued_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  const lifecycle = value.resource.kind === "change_request";
  if ((lifecycle || value.decision === "request_revision") && !value.reason?.trim()) {
    context.addIssue({ code: "custom", path: ["reason"], message: "reason wajib untuk keputusan ini" });
  }
  if (!lifecycle && value.decision === "approve" && value.reason !== undefined) {
    context.addIssue({ code: "custom", path: ["reason"], message: "reason tidak boleh dikirim untuk persetujuan" });
  }
  if (!lifecycle && value.decision === "reject") {
    context.addIssue({ code: "custom", path: ["decision"], message: "reject hanya untuk permintaan perubahan" });
  }
});

export const reviewAcknowledgmentSchema = z.object({
  contract_version: z.literal(1),
  acknowledgment_id: z.string().uuid(),
  command_id: z.string().uuid(),
  command_digest: z.string().regex(sha256Pattern),
  instance_id: z.string().uuid(),
  resource: resourceSchema,
  status: z.enum(["APPLIED", "REJECTED"]),
  result_code: z.string().regex(resultCodePattern),
  observed_version: z.number().int().min(0),
  observed_checksum: z.string().regex(sha256Pattern),
  processed_at: z.string().datetime({ offset: true }),
}).strict();

export type ReviewCommand = z.infer<typeof reviewCommandSchema>;
export type ReviewAcknowledgment = z.infer<typeof reviewAcknowledgmentSchema>;

export const reviewResultSchema = z.object({
  contract_version: z.literal(1), instance_id: z.string().uuid(), command_id: z.string().uuid(),
  command_digest: z.string().regex(sha256Pattern), resource: resourceSchema,
  request_nonce: z.string().uuid(), checked_at: z.string().datetime({ offset: true }),
  state: z.enum(["RECORDED", "NOT_RECORDED"]), acknowledgment: reviewAcknowledgmentSchema.nullable(),
}).strict().refine(value => (value.state === "RECORDED") === (value.acknowledgment !== null));

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON menolak angka non-finite.");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined || typeof item === "function" || typeof item === "symbol") {
        throw new TypeError("Canonical JSON menolak nilai yang tidak dapat diserialisasi.");
      }
      normalized[key] = normalize(item);
    }
    return normalized;
  }
  throw new TypeError("Canonical JSON hanya menerima nilai JSON.");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function payloadDigest(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

function requireHeaderText(value: string, label: string): string {
  if (!value || /[\r\n]/.test(value)) throw new TypeError(`${label} tidak valid.`);
  return value;
}

export function createTransportSigningMessage(input: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  contentSha256: string;
}): string {
  const method = requireHeaderText(input.method, "method").toUpperCase();
  const path = requireHeaderText(input.path, "path");
  const timestamp = requireHeaderText(input.timestamp, "timestamp");
  const nonce = requireHeaderText(input.nonce, "nonce");
  const digest = requireHeaderText(input.contentSha256, "contentSha256").toLowerCase();
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) throw new TypeError("path transport tidak valid.");
  if (!sha256Pattern.test(digest)) throw new TypeError("contentSha256 tidak valid.");
  return ["RUWANG-CONTROL-V1", method, path, timestamp, nonce, digest].join("\n");
}

export function signTransport(message: string, privateKey: KeyLike): string {
  return sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64url");
}

export function verifyTransport(message: string, signature: string, publicKey: KeyLike): boolean {
  try {
    return verify(null, Buffer.from(message, "utf8"), publicKey, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

export const transportHeaderNames = Object.freeze({
  instanceId: "x-rc-instance-id",
  keyId: "x-rc-key-id",
  timestamp: "x-rc-timestamp",
  nonce: "x-rc-nonce",
  contentSha256: "x-rc-content-sha256",
  signature: "x-rc-signature",
  acknowledgmentKeyId: "x-rc-ack-key-id",
  acknowledgmentTimestamp: "x-rc-ack-timestamp",
  acknowledgmentNonce: "x-rc-ack-nonce",
  acknowledgmentContentSha256: "x-rc-ack-content-sha256",
  acknowledgmentSignature: "x-rc-ack-signature",
});
