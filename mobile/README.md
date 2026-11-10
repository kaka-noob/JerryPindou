<!-- 本文件说明 Pindo React Native 手机工程的运行、打包与功能范围。 -->
# Pindo React Native

这是 Expo 管理的 React Native 应用，界面使用原生组件，图纸使用 Skia 绘制，不使用 WebView，也不依赖 Capacitor。
根目录保留原网页作为迁移参照，`lib` 中的类型、色板、颜色匹配、缩放和网格识别由两端共用。

## 三个命令

```powershell
npm run android
npm run release
npm run debug
```

以上命令均在项目根目录执行。首次运行自动安装手机工程依赖，每次运行自动同步原生工程。

- `android`：构建 release 应用，选择连接的手机，安装并启动；不需要 Expo Go 或开发服务器。
- `release`：只生成 release APK，不安装到手机。
- `debug`：只生成标准 RN debug APK；调试时需要在 `mobile` 目录运行 `npx expo start` 提供开发服务器。

直接安装前，手机需要打开 USB 调试，并允许这台电脑调试。连接多台设备时按提示选择手机。

## 安卓安装包

电脑需要安装 Node.js、Android Studio、Android SDK 和兼容的 JDK。可用 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT` 指定 SDK；Windows 也会自动查找默认 SDK 安装目录。

APK 位于 `mobile/android/app/build/outputs/apk/release/app-release.apk`。
debug 包位于 `mobile/android/app/build/outputs/apk/debug/app-debug.apk`。
本次本机构建在下载官方 `react-android-0.88.1-release.aar` 时超时，尚未生成独立 APK；JavaScript 资源导出与 Expo Go 运行已经验证。
Expo 模板的本地 release 默认使用调试签名，适合本机验证；正式发布需要配置自己的签名。
原生工程由 Expo 配置生成，修改应用配置后需要重新生成并构建。iOS 本地构建需要 macOS 和 Xcode。

## 已迁移功能

- 系统相册选图、系统图片裁剪、八套离线品牌色板、宽高颗数、比例锁定和颜色筛选。
- 写实、主色、清晰模式，最大颜色数、抖动和透明区域留空。
- 自动网格识别、色号高亮、用量统计、原生图纸滚动与缩放。
- 格子改色、撤销、专注拼豆标记、前台计时和本机工程恢复。
- PNG 保存相册、PNG/PDF/用量 CSV 系统分享、JSON 工程备份与导入。
- 无广告、作者宣传或启动倒计时弹窗。

大照片会先缩小到最长边 1600 像素，以控制手机内存。颗数上限为宽高各 200。
PDF 当前为完整图纸图片嵌入文档，尚未迁移网页的多页拼版排版；原生界面当前为中文。

## 检查

```powershell
npx tsc --noEmit
npx eslint .
```

检查命令在 `mobile` 目录执行，不再额外配置 npm 脚本。类型和静态检查通过不能替代设备运行验证。

本次已在安卓模拟器验证生成、绘图、完成标记、恢复、PNG 相册保存与文件分享，并在三星真机验证工程导入和进度恢复。详细记录见根目录 `migration-progress.md`。

项目许可遵循根目录 `LICENSE`；本目录的 `LICENSE` 保留 Expo 脚手架原始许可声明。
