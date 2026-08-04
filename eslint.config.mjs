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
    // mobile-app/ is a separate sub-project (own package.json,
    // dependencies, plain Node scripts) with no relation to this app's
    // module system -- it was never meant to go through this ESLint config.
    "mobile-app/**",
  ]),
]);

export default eslintConfig;
