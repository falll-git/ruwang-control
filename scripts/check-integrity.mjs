import { readFileSync, readdirSync } from "node:fs";
import { extname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const decoder = new TextDecoder("utf-8", { fatal: true });
const binaryExtensions = new Set([".gif", ".ico", ".jpeg", ".jpg", ".png", ".webp", ".woff", ".woff2"]);
const forkArchive = resolve(root, "vendor/ruwang-braces-depth-guard-3.0.3-ruwang.depth.1.tgz");
const paths = [];
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", ".next", ".control-postgres", ".control-runtime"].includes(entry.name)) continue;
    if ((entry.name.startsWith(".env") && entry.name !== ".env.example") || entry.name.endsWith(".tsbuildinfo") || entry.name.endsWith(".log")) continue;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${path}`);
    if (entry.isDirectory()) { inspect(path); continue; }
    const content = readFileSync(path);
    if (!content.length) throw new Error(`Empty file: ${path}`);
    if (path === forkArchive) {
      // Only this reviewed dependency archive is allowed; arbitrary .tgz files
      // remain subject to text validation. Validate installed/source provenance
      // below as well, never bless a binary just because of its extension.
      const provenance = JSON.parse(readFileSync(resolve(root, "vendor/braces-depth-guard/provenance.json"), "utf8"));
      if (content[0] !== 0x1f || content[1] !== 0x8b ||
          createHash("sha256").update(content).digest("hex") !== provenance.archiveSha256)
        throw new Error("Reviewed dependency archive integrity mismatch");
    } else if (!binaryExtensions.has(extname(path).toLowerCase())) {
      const text = decoder.decode(content);
      if (text.includes("\0") || /^(?:<{7}|={7}|>{7})(?: |$)/m.test(text))
        throw new Error(`NUL or conflict marker: ${path}`);
      if (path.endsWith(".json")) JSON.parse(text);
      if (path.endsWith(".mjs") || path.endsWith(".js")) execFileSync(process.execPath, ["--check", path]);
    }
    paths.push({ path: relative(root, path).replaceAll("\\", "/"), bytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex") });
  }
}
inspect(root);
execFileSync(process.execPath, [resolve(root, "scripts/verify-braces-fork.cjs")]);
const baseline = JSON.parse(readFileSync(resolve(root, "docs/source-evidence.json"), "utf8"));
const current = JSON.parse(execFileSync(process.execPath, [resolve(root, "scripts/source-baseline.mjs")], { encoding: "utf8" }));
if (!process.argv.includes('--files-only') && JSON.stringify(current.repositories) !== JSON.stringify(baseline.repositories))
  throw new Error("Reference repositories changed: inspect diff before continuing.");
console.log(JSON.stringify({ status: "passed", checkedAt: new Date().toISOString(),
  historicalReferenceMatch: JSON.stringify(current.repositories) === JSON.stringify(baseline.repositories),
  scope: process.argv.includes('--files-only') ? 'file integrity only; historical reference changes require separate candidate review' : 'file integrity and historical reference match',
  checks: ["UTF-8 text files", "known binary formats", "reviewed dependency archive and installed fork integrity/depth regression", "no empty files", "no NUL", "no conflict markers", "JSON parse", "JS/MJS syntax"],
  files: paths }, null, 2));
