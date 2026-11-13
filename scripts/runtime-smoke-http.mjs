import { request as httpRequest } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

// Only the caller-verified loopback preview (or an owned test server) is reachable.
// Native HTTP does not follow redirects; the deadline covers headers and the full body.
export function requestLoopback(path, { port = 4320, timeoutMs = 5000 } = {}) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("Smoke request memerlukan path lokal absolut.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535 ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) {
    throw new Error("Port atau batas waktu smoke request tidak sah.");
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const request = httpRequest({ hostname: "127.0.0.1", port, method: "GET", path, agent: false }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("error", error => finish(error));
      response.on("aborted", () => finish(new Error("Respons smoke terputus sebelum selesai.")));
      response.on("end", () => {
        const headers = new Headers();
        for (const [name, values] of Object.entries(response.headers)) {
          for (const value of Array.isArray(values) ? values : [values]) {
            if (value !== undefined) headers.append(name, value);
          }
        }
        const status = response.statusCode;
        finish(null, {
          response: { status, ok: status >= 200 && status < 300, headers },
          text: new TextDecoder().decode(Buffer.concat(chunks)),
        });
      });
    });
    const timer = setTimeout(() => {
      const error = new Error(`Smoke request melewati ${timeoutMs} ms.`);
      error.code = "SMOKE_REQUEST_TIMEOUT";
      request.destroy(error);
      finish(error);
    }, timeoutMs);
    request.on("error", error => finish(error));
    request.end();
  });
}

export async function waitForLoopbackHealth({ port = 4320, timeoutMs = 15_000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) {
    throw new Error("Batas waktu health smoke tidak sah.");
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { response } = await requestLoopback("/api/health", { port, timeoutMs: Math.min(2500, deadline - Date.now()) });
      if (response.ok) return;
    } catch { /* Runtime belum siap; seluruh percobaan tetap dibatasi deadline. */ }
    const remaining = deadline - Date.now();
    if (remaining > 0) await delay(Math.min(100, remaining));
  }
  throw new Error("Runtime tidak siap dalam batas waktu health smoke.");
}
