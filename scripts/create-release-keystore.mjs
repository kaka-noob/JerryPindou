// 在项目内生成并保留 release 密钥；密码通过环境变量交给 keytool，不写入命令参数。
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../signing');
const keystore = join(directory, 'pindo-release.jks');
const properties = join(directory, 'release.properties');
if (existsSync(keystore) && existsSync(properties)) {
  console.log('使用项目已有的 release 签名密钥。');
  process.exit(0);
}
if (existsSync(keystore) || existsSync(properties)) {
  console.error('签名文件不完整，请恢复 signing 目录的密钥或密码配置；不会覆盖或重新生成密钥。');
  process.exit(1);
}
mkdirSync(directory, { recursive: true });
const password = randomBytes(32).toString('hex');
const keytool = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : 'keytool';
const result = spawnSync(keytool, ['-genkeypair', '-noprompt', '-keystore', keystore, '-storetype', 'JKS',
  '-alias', 'pindo-release', '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000',
  '-dname', 'CN=Pindo Release, OU=Mobile, O=Pindo',
  '-storepass:env', 'PINDO_KEYSTORE_PASSWORD', '-keypass:env', 'PINDO_KEYSTORE_PASSWORD'], {
  env: { ...process.env, PINDO_KEYSTORE_PASSWORD: password }, stdio: 'inherit',
});
// 即使 keytool 在报告失败前写入了文件，也保存密码，避免留下无法恢复的密钥。
if (existsSync(keystore)) writeFileSync(properties, `storeFile=pindo-release.jks\nkeyAlias=pindo-release\nstorePassword=${password}\nkeyPassword=${password}\n`, { mode: 0o600, flag: 'wx' });
if (result.error || result.status !== 0) {
  console.error(result.error?.message || '生成签名密钥失败，请查看 keytool 输出。');
  process.exit(result.status || 1);
}
console.log(`已生成项目 release 密钥：${keystore}。请将密钥及 release.properties 一起备份。`);
