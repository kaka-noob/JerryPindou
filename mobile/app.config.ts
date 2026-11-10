// 本文件配置 Pindo 原生应用名称、安装标识、图标和系统权限说明。
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: '拼小兔',
  slug: 'pindo',
  scheme: 'pindo',
  version: '1.0.0',
  orientation: 'default',
  userInterfaceStyle: 'light',
  icon: './assets/pin-xiao-tu-icon.png',
  ios: { bundleIdentifier: 'com.jerry.pindou', supportsTablet: true },
  android: { package: 'com.jerry.pindou' },
  plugins: [
    './plugins/with-build-memory.cjs',
    './plugins/with-release-signing.cjs',
    'expo-router', 'expo-font', 'expo-splash-screen',
    ['expo-navigation-bar', { enforceContrast: false, style: 'dark' }],
    ['expo-image-picker', { photosPermission: '选择照片以生成拼豆图纸。', cameraPermission: false, microphonePermission: false }],
    ['expo-media-library', { photosPermission: '读取您选择的图片。', savePhotosPermission: '将拼豆图纸保存到相册。', granularPermissions: ['photo'] }],
    'expo-sharing',
  ],
};
export default config;
