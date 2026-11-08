import { canonicalJson, createTransportSigningMessage, payloadDigest, transportHeaderNames, verifyTransport } from "./control-review-contract.ts";
import { monitoringSnapshotSchema, type MonitoringSnapshot } from "./monitoring.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MonitoringTransportError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; this.name = "MonitoringTransportError"; }
}

export function verifyMonitoringSnapshotResponse(input: {
  response: Response;
  bodyText: string;
  source: { instanceId: string; sourceKind: "ruwang" | "sj_central"; responseKeyId: string; responsePublicKey: string };
  path: string;
  now: Date;
}): { snapshot: MonitoringSnapshot; nonce: string } {
  const contentType = input.response.headers.get("content-type")?.split(";", 1).at(0)?.trim().toLowerCase();
  if (!input.response.ok || contentType !== "application/json") throw new MonitoringTransportError("MONITOR_SOURCE_RESPONSE_INVALID");
  let parsed: unknown;
  try { parsed = JSON.parse(input.bodyText); } catch { throw new MonitoringTransportError("MONITOR_SOURCE_RESPONSE_INVALID"); }
  const result = monitoringSnapshotSchema.safeParse(parsed);
  if (!result.success || result.data.instance_id !== input.source.instanceId || result.data.source_kind !== input.source.sourceKind
      || canonicalJson(result.data) !== input.bodyText) throw new MonitoringTransportError("MONITOR_SOURCE_RESPONSE_INVALID");
  const keyId = input.response.headers.get(transportHeaderNames.acknowledgmentKeyId) ?? "";
  const timestamp = input.response.headers.get(transportHeaderNames.acknowledgmentTimestamp) ?? "";
  const nonce = input.response.headers.get(transportHeaderNames.acknowledgmentNonce) ?? "";
  const digest = input.response.headers.get(transportHeaderNames.acknowledgmentContentSha256) ?? "";
  const signature = input.response.headers.get(transportHeaderNames.acknowledgmentSignature) ?? "";
  const responseTime = Date.parse(timestamp);
  const sourceTime = Date.parse(result.data.observed_at);
  if (keyId !== input.source.responseKeyId || !uuidPattern.test(nonce) || digest !== payloadDigest(result.data)
      || !Number.isFinite(responseTime) || Math.abs(input.now.getTime() - responseTime) > 300_000
      || !Number.isFinite(sourceTime) || sourceTime - input.now.getTime() > 300_000
      || !verifyTransport(createTransportSigningMessage({ method: "GET", path: input.path, timestamp, nonce, contentSha256: digest }), signature, input.source.responsePublicKey)) {
    throw new MonitoringTransportError("MONITOR_SOURCE_SIGNATURE_INVALID");
  }
  return { snapshot: result.data, nonce };
}
