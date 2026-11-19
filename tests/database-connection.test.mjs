import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { controlDatabaseConnection } from "../src/lib/database-connection.ts";

const dsn = "postgresql://ruwang_control_runtime_test:fixture%40password@127.0.0.1:1/ruwang_control_test";

test("installed pg receives the same explicit Control TLS mode even when no URI transport is declared", () => {
  for (const [mode, expected] of [
    [undefined, false], ["disable", false], ["require", { rejectUnauthorized: false }],
    ["verify-full", { rejectUnauthorized: true }],
  ]) {
    const settings = controlDatabaseConnection(dsn, mode);
    assert.equal(settings.connectionString, dsn);
    const client = new Client(settings);
    assert.deepEqual(client.connectionParameters.ssl, expected);
    assert.equal(client.connectionParameters.database, "ruwang_control_test");
  }
});

test("Control rejects invalid or conflicting TLS before pg initializes a client", () => {
  for (const [mode, query] of [
    ["typo", ""], ["", ""], [undefined, "?sslmode=verify-full"],
    ["verify-full", "?sslmode=disable"], ["verify-full", "?ssl=no-verify"],
    ["verify-full", "?s%73lmode=verify-full&sslmode=disable"],
    ["verify-full", "?SSLMode=verify-full"], ["disable", "?sslnegotiation=direct"], ["require", "?sslnegotiation=direct"],
    ["require", "?sslmode=require"], ["require", "?sslmode=no-verify&uselibpqcompat=true"],
    ["verify-full", "?sslmode=verify-full&ssl=1"],
    ["require", "?sslrootcert=unused"], ["disable", "?sslkey=unused"],
    ["verify-full", "?sslnegotiation=typo"],
  ]) {
    assert.throws(() => controlDatabaseConnection(dsn + query, mode), error => {
      assert.match(error.message, /CONTROL_DATABASE_SSL/);
      assert.equal(error.message.includes(dsn), false);
      return true;
    });
  }
});

test("compatible URI options preserve pg transport semantics without overriding the resolved mode", () => {
  for (const [mode, query, expected] of [
    ["disable", "sslmode=disable", false],
    ["require", "sslmode=no-verify", { rejectUnauthorized: false }],
    ["require", "sslmode=require&uselibpqcompat=true", { rejectUnauthorized: false }],
    ["verify-full", "sslmode=verify-full&sslnegotiation=direct", { rejectUnauthorized: true }],
    ["verify-full", "sslmode=require", { rejectUnauthorized: true }],
    ["verify-full", "sslmode=prefer", { rejectUnauthorized: true }],
    ["verify-full", "sslmode=verify-ca", { rejectUnauthorized: true }],
  ]) {
    const settings = controlDatabaseConnection(`${dsn}?${query}&application_name=fixture`, mode);
    assert.equal(settings.connectionString, `${dsn}?application_name=fixture`);
    const client = new Client(settings);
    assert.deepEqual(client.connectionParameters.ssl, expected);
    assert.equal(client.connectionParameters.application_name, "fixture");
    if (query.includes("sslnegotiation=direct")) assert.equal(client.connectionParameters.sslnegotiation, "direct");
  }
});

test("a custom CA reaches pg without replacing explicit certificate verification", t => {
  const directory = mkdtempSync(join(tmpdir(), "control-tls-config-"));
  const certificate = join(directory, "test-ca.pem");
  t.after(() => { unlinkSync(certificate); rmdirSync(directory); });
  writeFileSync(certificate, "CA bytes used only to inspect configuration, without a network handshake", { flag: "wx" });

  const settings = controlDatabaseConnection(`${dsn}?sslmode=verify-full&sslrootcert=${encodeURIComponent(certificate)}`, "verify-full");
  assert.equal(settings.connectionString, dsn);
  const client = new Client(settings);
  assert.deepEqual(client.connectionParameters.ssl, {
    rejectUnauthorized: true,
    ca: "CA bytes used only to inspect configuration, without a network handshake",
  });
});
