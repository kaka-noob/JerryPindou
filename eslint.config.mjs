// 本文件配置原网页检查，原生工程使用 mobile 内的 Expo 检查配置。
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
    // 原生项目独立执行 Expo 检查，避免扫描生成的安卓工程。
    "mobile/**",
  ]),
]);

export default eslintConfig;
