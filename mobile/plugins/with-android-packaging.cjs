// Debug 与 Release 都内置页面代码；调试包独立安装，保留 Gradle 增量缓存。
const { withAppBuildGradle, withGradleProperties, withMainApplication } = require('expo/config-plugins');

module.exports = function withAndroidPackaging(config) {
  config = withAppBuildGradle(config, config => {
    const source = config.modResults.contents;
    if (!source.includes('// PINDO_STANDALONE_PACKAGES')) {
      if (!source.includes('react {') || !source.includes('debug {')) {
        throw new Error('Android 模板已变化，无法配置独立调试包。');
      }
      config.modResults.contents = source.replace('react {', `react {
    // PINDO_STANDALONE_PACKAGES
    debuggableVariants = []
    extraPackagerArgs = ["--max-workers", "2"]
`).replace(/(buildTypes\s*\{\s*debug\s*\{)/, `$1
            applicationIdSuffix ".debug"
            resValue "string", "app_name", "拼小兔（调试）"
`);
    }
    if (!config.modResults.contents.includes('// PINDO_BUNDLE_INPUTS')) {
      config.modResults.contents += `
// PINDO_BUNDLE_INPUTS: 共用算法和根目录版本改变时也必须重新打 JS。
tasks.configureEach { task ->
    if (task.name == 'createBundleDebugJsAndAssets' || task.name == 'createBundleReleaseJsAndAssets') {
        task.sources.exclude('**/.expo/**')
        task.inputs.dir(rootProject.file('../../lib'))
        task.inputs.dir(rootProject.file('../assets'))
        task.inputs.files(rootProject.file('../../package.json'), rootProject.file('../package.json'))
    }
}
`;
    }
    return config;
  });
  config = withMainApplication(config, config => {
    const source = config.modResults.contents;
    if (!source.includes('// PINDO_EMBEDDED_JS')) {
      const target = 'context = applicationContext,';
      if (!source.includes(target)) throw new Error('Android 模板已变化，无法配置内置 JS 加载。');
      config.modResults.contents = source.replace(target, `${target}
      // PINDO_EMBEDDED_JS: 这两个打包入口均用于脱离 Metro 的独立安装。
      useDevSupport = false,`);
    }
    return config;
  });
  return withGradleProperties(config, config => {
    const properties = {
      'org.gradle.parallel': 'false',
      'org.gradle.vfs.watch': 'false',
      'org.gradle.configuration-cache': 'false',
    };
    config.modResults = config.modResults.filter(item => !(item.key in properties));
    for (const [key, value] of Object.entries(properties)) {
      config.modResults.push({ type: 'property', key, value });
    }
    return config;
  });
};
