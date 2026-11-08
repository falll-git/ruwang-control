import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const repos = [
  { path: "D:/backend-production", files: [
    ".env.example",
    "prisma/schema.prisma",
    "prisma/migrations/20260910100000_add_ruwang_control_review_adapter/migration.sql",
    "prisma/migrations/20260910123000_allow_control_review_snapshot_outbox_event/migration.sql",
    "scripts/verify-migration-upgrade-paths.js",
    "scripts/verify-migration-upgrade-paths.test.js",
    "src/config/env.js",
    "src/integration/control-review-adapter.workflow.test.js",
    "src/modules/seputar-jaminan/controlReview.contract.js",
    "src/modules/seputar-jaminan/controlReview.contract.test.js",
    "src/modules/seputar-jaminan/controlReview.controller.js",
    "src/modules/seputar-jaminan/controlReview.route.js",
    "src/modules/seputar-jaminan/controlReview.service.js",
    "src/modules/seputar-jaminan/controlMonitoring.contract.js",
    "src/modules/seputar-jaminan/controlMonitoring.contract.test.js",
    "src/modules/seputar-jaminan/controlMonitoring.controller.js",
    "src/modules/seputar-jaminan/controlMonitoring.route.js",
    "src/modules/seputar-jaminan/controlMonitoring.service.js",
    "src/modules/seputar-jaminan/controlMonitoring.service.test.js",
    "src/modules/seputar-jaminan/profileContact.service.js",
    "src/modules/seputar-jaminan/seputarJaminan.service.js",
    "src/modules/seputar-jaminan/syncWorker.service.js",
    "src/modules/seputar-jaminan/syncWorker.test.js",
    "src/modules/seputar-jaminan/controlReviewSnapshot.service.js",
    "src/modules/seputar-jaminan/controlReviewSnapshot.service.test.js",
    "src/routes/api-v1.router.js",
    "src/system/seputar-jaminan-migration.test.js",
    "src/system/worker-heartbeat.js",
    "src/workers/seputar-jaminan.worker.js",
  ] },
  { path: "D:/frontend-production", files: [
    "src/components/seputar-jaminan/SeputarJaminanReviewClient.test.tsx",
    "src/components/seputar-jaminan/SeputarJaminanReviewClient.tsx",
    "src/components/seputar-jaminan/SeputarJaminanProfileContactClient.tsx",
    "src/types/seputar-jaminan.types.ts",
  ] },
  { path: "D:/seputarjaminan-production", files: [
    "apps/api/.env.example",
    "apps/api/src/app.ts",
    "apps/api/src/control-monitoring.ts",
    "apps/api/src/monitoring-runtime.ts",
    "apps/api/src/server.ts",
    "apps/api/tests/unit/control-monitoring.test.ts",
    "apps/worker/.env.example",
    "apps/worker/package.json",
    "apps/worker/src/heartbeat.ts",
    "apps/worker/src/server.ts",
    "apps/worker/tests/unit/heartbeat.test.ts",
    "package-lock.json",
    "packages/config/src/server.d.ts",
    "packages/config/src/server.mjs",
    "packages/config/tests/server.test.mjs",
    "packages/contracts/openapi/openapi.v1.yaml",
    "prisma/schema.prisma",
  ] },
];
const git = (path, args) => execFileSync("git", ["-C", path, ...args], { encoding: "utf8" }).trim();
const result = { inspectedAt: new Date().toISOString(), scope: "local source only; no VPS verification", repositories: repos.map(repo => ({
  path: repo.path, head: git(repo.path, ["rev-parse", "HEAD"]), status: git(repo.path, ["status", "--porcelain"]),
  files: repo.files.map(file => ({ path: file, sha256: createHash("sha256").update(readFileSync(join(repo.path, file))).digest("hex") })),
})) };
console.log(JSON.stringify(result, null, 2));
