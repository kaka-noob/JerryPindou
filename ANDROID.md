<!-- 本文件说明项目仅保留的三个安卓命令及其安装包位置。 -->
# 杰瑞拼豆安卓使用说明

在项目根目录执行以下命令：

| 命令 | 作用 |
| --- | --- |
| `npm run android` | 构建独立 release 应用，选择手机，安装并启动 |
| `npm run release` | 只生成 release APK |
| `npm run debug` | 只生成 debug APK |

首次运行自动安装手机工程依赖，每次运行自动同步原生配置，不需要手动执行 prebuild。
双击 `启动 Pindo.cmd` 等同于执行 `npm run android`。

Windows 的三个安卓命令固定使用 `D:\devApp\Gradle\gradle-9.8.2\bin\gradle.bat`，不再从环境变量或缓存自动选择其他版本。目录缺失时在安装依赖或生成原生工程前报错，请先将 `D:\devApp\Gradle\gradle-9.8.2-all.zip` 解压到同级目录。每次 Expo 生成工程后，启动脚本会恢复固定入口，并把 Wrapper 的版本同步为 9.8.2，优先引用上述本地压缩包。
Maven Central、Google Maven 和 Gradle 插件仓库统一通过阿里云镜像下载，包含 React Native 的嵌套插件构建。配置在每次原生工程生成后自动恢复，三个命令共用，不增加 npm 入口。
Gradle 9.8.2 内置 Kotlin 2.4，初始化脚本将 RN/Expo 自身的 Gradle 插件编译器对齐为 Kotlin 2.4.21；应用模块仍使用 Expo 配套 Kotlin，保证 Pika 和 Modules V2 编译插件兼容。
Windows 默认将 Gradle 缓存放到 `D:\devApp\Gradle\user-home`，CMake 中间文件放到更短的 `D:\pindo-cxx`；可分别通过 `GRADLE_USER_HOME`、`PINDO_CXX_ROOT` 覆盖。CMake 缓存按工程和模块生成独立标识，同时限制对象文件路径长度，避免深层 `node_modules` 路径导致 Ninja 无法创建目录。

电脑需要 Node.js、Android Studio、Android SDK 和兼容的 JDK。手机开启 USB 调试并授权电脑，连接多台设备时按提示选择手机。
当前电脑使用 JDK 21 运行 Gradle，并安装 JDK 17 供 RN Gradle 插件编译；JDK 17 路径已登记在 `D:\devApp\Gradle\user-home\gradle.properties`。原生依赖要求 NDK `27.1.12297006` 及对应版本的 CMake，可与已安装的新版本共存。
直接安装的 release 应用不依赖 Expo Go 或电脑开发服务器。标准 RN debug 包用于开发调试，需要在 `mobile` 目录运行 `npx expo start`。

安装包位置：

- release：`mobile/android/app/build/outputs/apk/release/app-release.apk`
- debug：`mobile/android/app/build/outputs/apk/debug/app-debug.apk`

应用名称为“杰瑞拼豆”，包名为 `com.jerry.pindou`。release 使用项目独立签名：首次构建自动生成 `signing/pindo-release.jks` 和 `signing/release.properties`，后续重复使用。两个文件均被 Git 忽略，需一起备份，详见 [signing/README.md](signing/README.md)。debug 继续使用调试签名。
2026-11-10 已成功构建 arm64 release APK（1.0.0，46.3 MiB），通过 apksigner 验签，证书与项目密钥一致；已核对包名、中文名称和用户提供的新图标。尚未安装到设备验证本轮界面改版。
Expo 配置插件将 Gradle 堆内存设为 4 GiB、Metaspace 设为 1536 MiB，解决 R8 / Android lint 在模板 512 MiB Metaspace 上限下的内存不足。
详细功能与验证记录见 [mobile/README.md](mobile/README.md) 和 [migration-progress.md](migration-progress.md)。
