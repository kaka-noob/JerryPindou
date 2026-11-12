// RN/Expo 的原生插件、R8 与 lint 同进程运行时需要比模板更大的类元数据空间。
const { withGradleProperties } = require('expo/config-plugins');

module.exports = function withBuildMemory(config) {
  return withGradleProperties(config, config => {
    config.modResults = config.modResults.filter(item => item.key !== 'org.gradle.jvmargs');
    config.modResults.push({
      type: 'property',
      key: 'org.gradle.jvmargs',
      value: '-Xmx4096m -XX:MaxMetaspaceSize=1536m',
    });
    return config;
  });
};
