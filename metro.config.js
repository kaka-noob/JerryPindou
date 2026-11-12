// 本文件配置原生打包器读取共用算法，并统一原生依赖的解析位置。
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.watchFolders = [__dirname];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), path.resolve(__dirname, 'node_modules')];
module.exports = config;
