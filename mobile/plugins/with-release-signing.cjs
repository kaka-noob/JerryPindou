// 通过 Expo 配置插件恢复正式 release 签名，密钥与密码均在已忽略的项目 signing 目录。
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, config => {
    if (config.modResults.language !== 'groovy') throw new Error('Release 签名插件需要 Groovy build.gradle。');
    if (!config.modResults.contents.includes('// PINDO_RELEASE_SIGNING')) {
      config.modResults.contents += `
// PINDO_RELEASE_SIGNING
def pindoSigningFile = rootProject.file('../../signing/release.properties')
if (pindoSigningFile.exists()) {
    def pindoSigning = new java.util.Properties()
    pindoSigningFile.withInputStream { pindoSigning.load(it) }
    android {
        signingConfigs {
            pindoRelease {
                storeFile new File(pindoSigningFile.parentFile, pindoSigning.getProperty('storeFile'))
                storePassword pindoSigning.getProperty('storePassword')
                keyAlias pindoSigning.getProperty('keyAlias')
                keyPassword pindoSigning.getProperty('keyPassword')
            }
        }
        buildTypes.release.signingConfig = signingConfigs.pindoRelease
    }
} else if (gradle.startParameter.taskNames.any { it.toLowerCase().contains('release') }) {
    throw new GradleException('缺少 signing/release.properties，请从项目根目录运行 npm run release。')
}
`;
    }
    return config;
  });
};
