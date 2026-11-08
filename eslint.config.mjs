import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // Vendored MIT library is checksum-verified and tested by verify-braces-fork.
  globalIgnores([".next/**", "dist/**", ".control-postgres/**", ".control-runtime/**", "vendor/braces-depth-guard/**"]),
]);
