// 本文件统一处理手机安装、release 打包和 debug 打包三个安卓入口。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../mobile');
const mode = process.argv[2];
if (process.argv.includes('--help') || !['install', 'release', 'debug'].includes(mode)) {
  console.log('在项目根目录运行：npm run android（安装到手机）、npm run release、npm run debug。');
  process.exit(process.argv.includes('--help') ? 0 : 1);
}

const environment = { ...process.env };
if (!environment.ANDROID_HOME && !environment.ANDROID_SDK_ROOT && process.platform === 'win32' && environment.LOCALAPPDATA) {
  const sdkDirectory = resolve(environment.LOCALAPPDATA, 'Android/Sdk');
  if (existsSync(sdkDirectory)) environment.ANDROID_HOME = sdkDirectory;
}

// 执行固定的构建命令，失败时立即停止并保留原始错误输出。
function run(command, args, cwd = mobileDirectory) {
  const result = spawnSync(command, args, {
    cwd, env: environment, stdio: 'inherit',
    shell: process.platform === 'win32' && (command.endsWith('.bat') || command === 'npm'),
  });
  if (result.error) console.error(`执行失败：${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(resolve(mobileDirectory, 'node_modules/expo/package.json'))) {
  console.log('首次运行，正在安装手机工程依赖…');
  run('npm', ['ci']);
}

const expoCli = resolve(mobileDirectory, 'node_modules/expo/bin/cli');
// 每次构建前同步应用配置与原生插件，省去手动 prebuild 步骤。
run(process.execPath, [expoCli, 'prebuild', '--platform', 'android', '--no-install']);

// 使用当前工程要求的本地 Gradle，并在重新生成工程后恢复镜像入口。
function configureGradle() {
  const androidDirectory = resolve(mobileDirectory, 'android');
  const properties = readFileSync(resolve(androidDirectory, 'gradle/wrapper/gradle-wrapper.properties'), 'utf8');
  const version = properties.match(/gradle-([\d.]+)-(?:bin|all)\.zip/)?.[1];
  const gradleUserHome = environment.GRADLE_USER_HOME || resolve(environment.USERPROFILE || environment.HOME, '.gradle');
  const candidates = [environment.PINDO_GRADLE_HOME, environment.GRADLE_HOME].filter(Boolean);
  for (const kind of ['bin', 'all']) {
    const cache = resolve(gradleUserHome, `wrapper/dists/gradle-${version}-${kind}`);
    if (existsSync(cache)) {
      for (const directory of readdirSync(cache)) candidates.push(join(cache, directory, `gradle-${version}`));
    }
  }
  const localHome = candidates.find(directory => existsSync(join(directory, `lib/gradle-launcher-${version}.jar`)));
  const mirror = resolve(mobileDirectory, '../scripts/aliyun-mirror.init.gradle');
  const wrapper = resolve(androidDirectory, 'gradlew.bat');
  let content = readFileSync(wrapper, 'utf8');
  if (process.platform === 'win32' && localHome) {
    // 保留生成的启动器原文，在开头委托给版本匹配的本地 Gradle。
    content = content.replace(/@echo off/i, `@echo off\r\n@rem 使用本地 Gradle 和国内依赖镜像。\r\n@call "${join(localHome, 'bin/gradle.bat')}" --init-script "${mirror}" %*\r\n@exit /b %errorlevel%`);
    console.log(`使用本地 Gradle ${version}：${localHome}`);
  } else {
    content = content.replace(/(gradle-wrapper\.jar"[^\r\n]*?) %\*/, `$1 --init-script "${mirror}" %*`);
    console.log(`使用 Gradle Wrapper ${version} 和阿里云依赖镜像。`);
  }
  writeFileSync(wrapper, content, 'utf8');
  // 官方脚本仍负责手机选择与安装；通过进程参数限制并行并延长下载等待。
  environment.GRADLE_OPTS = `${environment.GRADLE_OPTS || ''} -Dorg.gradle.internal.http.connectionTimeout=60000 -Dorg.gradle.internal.http.socketTimeout=120000 -Dorg.gradle.workers.max=2 -Dorg.gradle.parallel=false`;
}

configureGradle();

if (mode === 'install') {
  const sdk = environment.ANDROID_HOME || environment.ANDROID_SDK_ROOT;
  const adb = sdk ? resolve(sdk, `platform-tools/adb${process.platform === 'win32' ? '.exe' : ''}`) : 'adb';
  const devices = spawnSync(adb, ['devices'], { env: environment, encoding: 'utf8' });
  const serials = (devices.stdout || '').split(/\r?\n/).map(line => line.match(/^(\S+)\s+device$/)?.[1]).filter(Boolean);
  const serial = environment.ANDROID_SERIAL || (serials.length === 1 ? serials[0] : null);
  if (!serial || !serials.includes(serial)) {
    console.error('请连接并授权一台手机；多台设备时用 ANDROID_SERIAL 指定目标手机。');
    process.exit(1);
  }
  const architecture = spawnSync(adb, ['-s', serial, 'shell', 'getprop', 'ro.product.cpu.abi'], { env: environment, encoding: 'utf8' }).stdout?.trim();
  if (!['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'].includes(architecture)) {
    console.error('无法读取手机 CPU 架构，请检查 USB 调试连接。');
    process.exit(1);
  }
  environment.ANDROID_SERIAL = serial;
  console.log(`只构建并安装到手机 ${serial}，CPU 架构：${architecture}，单任务编译。`);
  run(process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew',
    ['installRelease', `-PreactNativeArchitectures=${architecture}`, '-Pkotlin.compiler.execution.strategy=in-process', '--max-workers=1', '--console=plain'], resolve(mobileDirectory, 'android'));
  run(adb, ['-s', serial, 'shell', 'am', 'start', '-n', 'com.pindo.app/.MainActivity']);
} else {
  run(process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew',
    [mode === 'release' ? 'assembleRelease' : 'assembleDebug', '--console=plain', '--max-workers=2'], resolve(mobileDirectory, 'android'));
  console.log(`安装包已生成：${resolve(mobileDirectory, `android/app/build/outputs/apk/${mode}/app-${mode}.apk`)}`);
}
