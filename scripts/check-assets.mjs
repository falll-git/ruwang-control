import { readFile, stat } from "node:fs/promises";
const root = new URL("../dist/", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const references = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]);
for (const path of references) {
  if (path.includes(":") || path.includes("..")) throw new Error(`Non-local asset: ${path}`);
  if (!(await stat(new URL(path.replace(/^\//, ""), root))).isFile()) throw new Error(`Missing asset: ${path}`);
}
if (!html.includes('lang="id"') || !html.includes("Pratinjau lokal")) throw new Error("Preview metadata missing");
console.log(`Asset check passed: ${references.length} local references; preview explicitly labelled.`);
