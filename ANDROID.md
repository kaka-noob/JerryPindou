<!-- 本文件说明项目仅保留的三个安卓命令及其安装包位置。 -->
# Pindo 安卓使用说明

在项目根目录执行以下命令：

| 命令 | 作用 |
| --- | --- |
| `npm run android` | 构建独立 release 应用，选择手机，安装并启动 |
| `npm run release` | 只生成 release APK |
| `npm run debug` | 只生成 debug APK |

首次运行自动安装手机工程依赖，每次运行自动同步原生配置，不需要手动执行 prebuild。
双击 `启动 Pindo.cmd` 等同于执行 `npm run android`。

Windows 构建优先使用与工程要求版本一致的本地 Gradle：先检查 `PINDO_GRADLE_HOME`、`GRADLE_HOME`，再检查 `GRADLE_USER_HOME/wrapper/dists` 缓存。当前工程要求 Gradle 9.4.1，不能直接套用旧 RN 项目的 8.11.1。无匹配安装时使用工程自带的 Wrapper。
Maven Central、Google Maven 和 Gradle 插件仓库统一通过阿里云镜像下载，包含 React Native 的嵌套插件构建。配置在每次原生工程生成后自动恢复，三个命令共用，不增加 npm 入口。
Windows 的 CMake 中间文件放到工程盘符根目录的 `pindo-cxx` 缓存目录下，并按工程和模块生成独立标识，同时限制对象文件路径长度，避免深层 `node_modules` 路径导致 Ninja 无法创建目录。

电脑需要 Node.js、Android Studio、Android SDK 和兼容的 JDK。手机开启 USB 调试并授权电脑，连接多台设备时按提示选择手机。
直接安装的 release 应用不依赖 Expo Go 或电脑开发服务器。标准 RN debug 包用于开发调试，需要在 `mobile` 目录运行 `npx expo start`。

安装包位置：

- release：`mobile/android/app/build/outputs/apk/release/app-release.apk`
- debug：`mobile/android/app/build/outputs/apk/debug/app-debug.apk`

当前 Expo 模板的 release 构建仍使用调试签名；正式发布前需要配置自己的签名密钥。签名密钥不得提交到仓库。
此前本机构建因官方下载 `react-android-0.88.1-release.aar` 超时而未生成 APK；改用镜像后，已验证该文件完整下载并核对镜像返回的 MD5。完整 APK 的构建状态见迁移记录。
详细功能与验证记录见 [mobile/README.md](mobile/README.md) 和 [migration-progress.md](migration-progress.md)。
