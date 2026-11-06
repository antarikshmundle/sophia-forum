// ESLint 9 flat config. eslint-config-next 15 ships the legacy (eslintrc) format, so it is loaded through the official
// compatibility layer; the rules are the same as the former .eslintrc.json ("next/core-web-vitals").
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "qa/**", "supabase/**", "test-results/**", "playwright-report/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals"),
];

export default config;
