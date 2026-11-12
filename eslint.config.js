// 本文件启用 Expo 官方原生项目检查，并排除生成的原生工程与资源。
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
module.exports = defineConfig([expoConfig, { ignores: ['dist/**', 'android/**', 'ios/**', '.expo/**'] }]);
