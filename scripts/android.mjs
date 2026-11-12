// 本文件统一处理手机安装、release 打包和 debug 打包三个安卓入口。
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
if (process.argv.includes('--help') || !['install', 'release', 'debug'].includes(mode)) {
  console.log('在项目根目录运行：npm run android（安装到手机）、npm run release、npm run debug。');
  process.exit(process.argv.includes('--help') ? 0 : 1);
}

const environment = { ...process.env };
const appPackage = JSON.parse(readFileSync(resolve(projectDirectory, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(appPackage.version) || !Number.isSafeInteger(appPackage.buildNumber) || appPackage.buildNumber < 1) {
  throw new Error('根目录 package.json 必须设置三段 version 和正整数 buildNumber。');
}
const fixedGradleVersion = '9.4.1';
const fixedGradleHome = String.raw`D:\devApp\Gradle\gradle-9.4.1`;
const fixedGradleArchive = String.raw`D:\devApp\Gradle\gradle-9.4.1-bin.zip`;
if (process.platform === 'win32') {
  if (!existsSync(join(fixedGradleHome, 'bin/gradle.bat')) || !existsSync(join(fixedGradleHome, `lib/gradle-launcher-${fixedGradleVersion}.jar`))) {
    console.error(`找不到固定的 Gradle ${fixedGradleVersion}，请将安装包解压到 ${fixedGradleHome}。`);
    process.exit(1);
  }
  // 仅影响本次构建进程，不修改系统环境变量，也不接受其他版本覆盖。
  environment.GRADLE_HOME = fixedGradleHome;
  environment.GRADLE_USER_HOME ||= String.raw`D:\devApp\Gradle\user-home`;
  environment.PINDO_CXX_ROOT ||= String.raw`D:\pindo-cxx`;
}
if (!environment.ANDROID_HOME && !environment.ANDROID_SDK_ROOT && process.platform === 'win32' && environment.LOCALAPPDATA) {
  const sdkDirectory = resolve(environment.LOCALAPPDATA, 'Android/Sdk');
  if (existsSync(sdkDirectory)) environment.ANDROID_HOME = sdkDirectory;
}

// 执行固定的构建命令，失败时立即停止并保留原始错误输出。
function run(command, args, cwd = projectDirectory) {
  const result = spawnSync(command, args, {
    cwd, env: environment, stdio: 'inherit',
    shell: process.platform === 'win32' && (command.endsWith('.bat') || command === 'npm'),
  });
  if (result.error) console.error(`执行失败：${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(resolve(projectDirectory, 'node_modules/expo/package.json'))) {
  console.log('首次运行，正在安装手机工程依赖…');
  run('npm', ['ci']);
}

const expoCli = resolve(projectDirectory, 'node_modules/expo/bin/cli');
if (mode !== 'debug') run(process.execPath, [resolve(projectDirectory, 'scripts/create-release-keystore.mjs')]);
// SDK 58 默认清空原生目录；显式保留目录才能复用 Gradle 编译结果。
run(process.execPath, [expoCli, 'prebuild', '--platform', 'android', '--no-install', '--no-clean']);

// 每次 Expo 重新生成工程后，恢复固定 Gradle 入口与依赖镜像。
function configureGradle() {
  const androidDirectory = resolve(projectDirectory, 'android');
  const mirror = resolve(projectDirectory, 'scripts/aliyun-mirror.init.gradle');
  const wrapper = resolve(androidDirectory, 'gradlew.bat');
  let content = readFileSync(wrapper, 'utf8');
  if (process.platform === 'win32') {
    // Expo 会重建启动器；清除旧转发块，使重复配置也只保留一个固定入口。
    content = content.replace(/\r?\n@rem 使用本地 Gradle 和国内依赖镜像。\r?\n@call [^\r\n]+\r?\n@exit \/b %errorlevel%/g, '');
    content = content.replace(/@echo off/i, `@echo off\r\n@rem 使用本地 Gradle 和国内依赖镜像。\r\n@call "${join(fixedGradleHome, 'bin/gradle.bat')}" --init-script "${mirror}" %*\r\n@exit /b %errorlevel%`);
    // 元数据也固定到本地 9.4.1 压缩包，禁止回退到远程分发下载。
    const propertiesPath = resolve(androidDirectory, 'gradle/wrapper/gradle-wrapper.properties');
    const distribution = `file:///${fixedGradleArchive.replaceAll('\\', '/')}`;
    const properties = readFileSync(propertiesPath, 'utf8')
      .replace(/^distributionUrl=.*$/m, `distributionUrl=${distribution}`)
      .replace(/^distributionSha256Sum=.*\r?\n?/m, '');
    writeFileSync(propertiesPath, properties, 'utf8');
    console.log(`固定使用 Gradle ${fixedGradleVersion}：${fixedGradleHome}`);
  } else {
    content = content.replace(/(gradle-wrapper\.jar"[^\r\n]*?) %\*/, `$1 --init-script "${mirror}" %*`);
    console.log('使用工程 Gradle Wrapper 和阿里云依赖镜像。');
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
    [':app:installRelease', `-PreactNativeArchitectures=${architecture}`, '-Pkotlin.compiler.execution.strategy=in-process', '--max-workers=1', '--console=plain'], resolve(projectDirectory, 'android'));
  run(adb, ['-s', serial, 'shell', 'am', 'start', '-n', 'com.jerry.pindou/.MainActivity']);
} else {
  const architectures = process.argv.includes('--all-abis') ? 'armeabi-v7a,arm64-v8a,x86,x86_64' : (environment.ANDROID_ARCHES || 'arm64-v8a');
  if (!architectures.split(',').every(abi => ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'].includes(abi))) {
    throw new Error(`无效的 CPU 架构：${architectures}`);
  }
  console.log(`构建 ${mode}，CPU 架构：${architectures}；保留原生增量缓存。`);
  run(process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew',
    [mode === 'release' ? ':app:assembleRelease' : ':app:assembleDebug', `-PreactNativeArchitectures=${architectures}`, '--console=plain', '--max-workers=2'], resolve(projectDirectory, 'android'));
  console.log(`安装包已生成：${resolve(projectDirectory, `android/app/build/outputs/apk/${mode}/app-${mode}.apk`)}`);
  {
    const apkDirectory = resolve(projectDirectory, `android/app/build/outputs/apk/${mode}`);
    const metadata = JSON.parse(readFileSync(join(apkDirectory, 'output-metadata.json'), 'utf8'));
    const { version: expectedVersion, buildNumber } = JSON.parse(readFileSync(resolve(projectDirectory, 'package.json'), 'utf8'));
    const output = metadata.elements[0];
    const expectedId = mode === 'debug' ? 'com.jerry.pindou.debug' : 'com.jerry.pindou';
    if (metadata.applicationId !== expectedId || output.versionName !== expectedVersion || output.versionCode !== buildNumber) {
      throw new Error('安装包的包名或版本与工程不一致，停止导出。');
    }
    const apk = join(apkDirectory, output.outputFile);
    const sdk = environment.ANDROID_HOME || environment.ANDROID_SDK_ROOT;
    if (!sdk) throw new Error('无法定位 Android SDK，不能校验安装包。');
    const buildTools = readdirSync(join(sdk, 'build-tools')).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map(version => join(sdk, 'build-tools', version)).find(directory => existsSync(join(directory, process.platform === 'win32' ? 'aapt.exe' : 'aapt')));
    if (!buildTools) throw new Error('找不到 aapt，不能校验安装包。');
    const aapt = join(buildTools, process.platform === 'win32' ? 'aapt.exe' : 'aapt');
    const badging = spawnSync(aapt, ['dump', 'badging', apk], { encoding: 'utf8' });
    if (badging.status !== 0 || !badging.stdout.includes(`name='${expectedId}'`) ||
        !badging.stdout.includes(`versionName='${expectedVersion}'`) || !badging.stdout.includes(`versionCode='${buildNumber}'`)) {
      throw new Error('APK 内部版本校验失败，停止导出。');
    }
    const contents = spawnSync(aapt, ['list', apk], { encoding: 'utf8' });
    if (contents.status !== 0 || !contents.stdout.split(/\r?\n/).includes('assets/index.android.bundle')) {
      throw new Error('APK 缺少内置 JS 页面代码，停止导出。');
    }
    run(join(buildTools, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner'), ['verify', apk]);
    const hash = createHash('sha256').update(readFileSync(apk)).digest('hex');
    const releaseDirectory = resolve(projectDirectory, 'releases');
    mkdirSync(releaseDirectory, { recursive: true });
    const destination = join(releaseDirectory, `pinxiaotu-${mode}-v${output.versionName}+${output.versionCode}-${hash.slice(0, 8)}.apk`);
    copyFileSync(apk, destination);
    writeFileSync(`${destination}.sha256`, `${hash}  ${destination.split(/[\\/]/).pop()}\n`);
    console.log(`请传输并安装这个带版本的文件：${destination}\nSHA-256：${hash}`);
  }
}
