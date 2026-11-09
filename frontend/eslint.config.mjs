import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Mozilla pdf.js builds (Apache-2.0) that are copied into public/
    // as static assets. They are third party code and must not be linted or
    // edited (their UMD wrapper trips @next/next/no-assign-module-variable).
    "public/pdf*.js",
  ]),
]);

export default eslintConfig;
