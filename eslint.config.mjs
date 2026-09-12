import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Uploaded files and everything derived from them. It sits under src/ only
    // because that is where the phase-1 storage root is; none of it is source,
    // and some of it is written by the container as root.
    "src/data/**",
  ]),
]);

export default eslintConfig;
