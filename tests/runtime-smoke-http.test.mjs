import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { requestLoopback, waitForLoopbackHealth } from "../scripts/runtime-smoke-http.mjs";

async function withOwnedServer(handler, check) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await check(server.address().port); }
  finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("smoke transport preserves status, headers, path and the complete UTF-8 body", async () => {
  const body = Buffer.from("Masuk ke Ruwang Control · siap");
  await withOwnedServer((request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/login?group=content&state=IN_REVIEW");
    response.writeHead(401, { "x-frame-options": "DENY" });
    const split = body.indexOf(Buffer.from("·")) + 1;
    response.write(body.subarray(0, split));
    response.end(body.subarray(split));
  }, async port => {
    const result = await requestLoopback("/login?group=content&state=IN_REVIEW", { port });
    assert.equal(result.response.status, 401);
    assert.equal(result.response.ok, false);
    assert.equal(result.response.headers.get("x-frame-options"), "DENY");
    assert.equal(result.text, body.toString("utf8"));
  });
});

test("smoke transport returns redirects without requesting their destination", async () => {
  const paths = [];
  await withOwnedServer((request, response) => {
    paths.push(request.url);
    response.writeHead(307, { location: "/destination" });
    response.end("redirect");
  }, async port => {
    const result = await requestLoopback("/", { port });
    assert.equal(result.response.status, 307);
    assert.equal(result.response.ok, false);
    assert.equal(result.response.headers.get("location"), "/destination");
    assert.equal(result.text, "redirect");
    assert.deepEqual(paths, ["/"]);
  });
});

for (const phase of ["headers", "streaming body"]) {
  test(`smoke transport stops a stalled ${phase} within its total deadline`, async () => {
    let closed;
    await withOwnedServer((request, response) => {
      closed = new Promise(resolve => request.socket.once("close", resolve));
      if (phase === "streaming body") {
        response.writeHead(200);
        response.write("partial");
        const interval = setInterval(() => response.write("."), 10);
        response.on("close", () => clearInterval(interval));
      }
    }, async port => {
      const started = performance.now();
      await assert.rejects(requestLoopback("/api/health", { port, timeoutMs: 80 }), { code: "SMOKE_REQUEST_TIMEOUT" });
      assert.ok(performance.now() - started < 2000, "The complete request must finish within a bounded time.");
      await closed;
    });
  });
}

test("smoke transport rejects a body closed before its declared length", async () => {
  await withOwnedServer((request, response) => {
    response.writeHead(200, { "content-length": "100" });
    response.write("partial");
    response.socket.end();
  }, async port => {
    await assert.rejects(requestLoopback("/api/health", { port }));
  });
});

test("health polling retries an unavailable response before accepting a complete success", async () => {
  let calls = 0;
  await withOwnedServer((request, response) => {
    assert.equal(request.url, "/api/health");
    response.writeHead(++calls < 2 ? 503 : 200);
    response.end("health");
  }, async port => {
    await waitForLoopbackHealth({ port, timeoutMs: 2000 });
    assert.equal(calls, 2);
  });
});

for (const phase of ["redirect", "stalled body"]) {
  test(`health polling does not accept a ${phase} or outlive its overall deadline`, async () => {
    const paths = [];
    await withOwnedServer((request, response) => {
      paths.push(request.url);
      response.writeHead(phase === "redirect" ? 302 : 200, { location: "/destination" });
      if (phase === "redirect") response.end();
      else response.write("partial");
    }, async port => {
      const started = performance.now();
      await assert.rejects(waitForLoopbackHealth({ port, timeoutMs: 180 }), /Runtime tidak siap/);
      assert.ok(performance.now() - started < 2000, "Health retries must share the overall deadline.");
      assert.ok(paths.length > 0);
      assert.ok(paths.every(path => path === "/api/health"));
    });
  });
}

test("smoke transport rejects external or ambiguous targets and invalid bounds", () => {
  for (const path of ["https://example.invalid/", "http://127.0.0.1/", "//example.invalid/", "/\\example.invalid/", "relative"]) {
    assert.throws(() => requestLoopback(path), /path lokal/);
  }
  for (const options of [{ port: 0 }, { port: 65536 }, { port: 4320.5 }, { timeoutMs: 0 }, { timeoutMs: 5001 }]) {
    assert.throws(() => requestLoopback("/", options), /tidak sah/);
  }
});
