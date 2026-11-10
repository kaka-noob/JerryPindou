# Release 签名

`pindo-release.jks` 为本项目独立的 Android release 签名密钥，别名 `pindo-release`。
`release.properties` 保存密钥文件名、别名及随机密码。两个文件均已加入 Git 忽略。

首次运行 `npm run release` 或 `npm run android` 时，脚本在缺少密钥的情况下生成一次；后续重复使用，绝不自动覆盖已有密钥。密钥或配置只缺一个时会停止，避免误生成其他签名。

请将本目录中的密钥和密码配置一同备份；换电脑时一同复制到新项目的 `signing` 目录，才能继续用同一签名发布更新。不要将它们提交或上传到代码仓库。

生成命令：`node scripts/create-release-keystore.mjs`。应用的 Expo 配置插件在每次 prebuild 后恢复签名配置；debug 包继续使用 debug 签名。
