import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createPreviewServer } from "../scripts/preview.mjs";

test("preview is static, restricts assets and rejects mutations", async () => {
  const server = createPreviewServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ["/", "/styles.css", "/app.js", "/mark.svg"]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-security-policy"), /connect-src 'none'/);
      await response.arrayBuffer();
    }
    for (const route of ["/.env", "/docs/architecture.md", "/src/domain/authorization.ts", "/api/reviews", "/%2e%2e/package.json"]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 404);
      await response.arrayBuffer();
    }
    const response = await fetch(base + "/", { method: "POST", body: "test" });
    assert.equal(response.status, 405);
    await response.arrayBuffer();
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
