import { access, cp, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const standalone = resolve(root, ".next", "standalone");
const exists = async path => { try { await access(path, constants.F_OK); return true; } catch { return false; } };

if (!await exists(resolve(standalone, "server.js"))) throw new Error("Build standalone Next.js belum tersedia.");
await mkdir(resolve(standalone, ".next"), { recursive: true });
await cp(resolve(root, ".next", "static"), resolve(standalone, ".next", "static"), { recursive: true, force: true });
if (await exists(resolve(root, "public"))) {
  await cp(resolve(root, "public"), resolve(standalone, "public"), { recursive: true, force: true });
}
console.log(JSON.stringify({ artifact: ".next/standalone", staticAssets: true, status: "prepared" }));
