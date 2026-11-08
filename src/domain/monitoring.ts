import { z } from "zod";

export const monitorStatusSchema = z.enum(["healthy", "degraded", "offline", "stale", "unknown"]);
export type MonitorStatus = z.infer<typeof monitorStatusSchema>;

const sourceStatusSchema = z.enum(["healthy", "degraded", "unknown"]);
const componentSchema = z.object({
  key: z.enum(["frontend", "api", "readiness", "worker", "pipeline"]),
  status: sourceStatusSchema,
  detail_code: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/).optional(),
}).strict();
const queueSchema = z.object({
  key: z.enum(["review", "outbox", "media", "central_jobs"]),
  status: sourceStatusSchema,
  depth: z.number().int().nonnegative().optional(),
  detail_code: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/).optional(),
}).strict();

export const monitoringSnapshotSchema = z.object({
  contract_version: z.literal(1),
  instance_id: z.string().uuid(),
  source_kind: z.enum(["ruwang", "sj_central"]),
  observed_at: z.iso.datetime({ offset: true }),
  services: z.array(componentSchema).max(5).refine(items => new Set(items.map(item => item.key)).size === items.length),
  queues: z.array(queueSchema).max(4).refine(items => new Set(items.map(item => item.key)).size === items.length),
}).strict();

export type MonitoringSnapshot = z.infer<typeof monitoringSnapshotSchema>;

export function monitoringSummary(snapshot: MonitoringSnapshot): "healthy" | "degraded" | "unknown" {
  const components = [...snapshot.services, ...snapshot.queues];
  if (components.some(item => item.status === "degraded")) return "degraded";
  if (!components.length || components.some(item => item.status === "unknown")) return "unknown";
  return "healthy";
}

export function monitoringBaseUrl(value: string, production: boolean): URL {
  const url = new URL(value);
  const loopback = ["127.0.0.1", "localhost"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (production ? url.protocol !== "https:" : url.protocol !== "https:" && !(loopback && url.protocol === "http:"))) {
    throw new TypeError("MONITOR_SOURCE_URL_INVALID");
  }
  return url;
}

export function displayStatus(input: {
  status: "healthy" | "degraded" | "offline" | "unknown";
  observedAt: Date | null;
  staleAfterSeconds: number;
  now?: Date;
}): MonitorStatus {
  if (!input.observedAt) return "unknown";
  const now = input.now ?? new Date();
  if (now.getTime() - input.observedAt.getTime() > input.staleAfterSeconds * 1000) return "stale";
  return input.status;
}

export function monitoringBackoffSeconds(failures: number, intervalSeconds: number, maximumSeconds: number): number {
  const boundedFailures = Math.max(0, Math.min(Math.trunc(failures), 8));
  return Math.min(intervalSeconds * 2 ** Math.max(0, boundedFailures - 1), maximumSeconds);
}
