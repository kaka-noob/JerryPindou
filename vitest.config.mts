// 本文件为 Vitest 配置项目路径别名，供原生生成逻辑的单元测试使用。
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': projectRoot,
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
