import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const server = resolve(import.meta.dirname, "..", ".next", "standalone", "server.js");
await access(server, constants.R_OK);
try { process.loadEnvFile?.(resolve(import.meta.dirname, "..", ".env.local")); } catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
process.env.HOSTNAME ??= "127.0.0.1";
process.env.PORT ??= "4320";
await import(pathToFileURL(server).href);
