# 0.14.1 世界与更新渠道整合

整合 `feat/world-expression-history@12b24ac` 与 `fix/android-update-resume@e52eba7`，不合并主分支。版本为 0.14.1-trial / versionCode 21，修正已发布 0.13.2 和仅本地分发 0.14.0 都使用 20 的冲突。

世界全局记录、来源记忆删除、人物皮肤、表情、图集方向和家具动作沿用 [世界呈现说明](WORLD_EXPRESSION_HISTORY.md)。更新模块整合 [直接清单、续传和发布流程](UPDATE_CHANNEL.md)，无新运行依赖或业务数据迁移。

数据所有者不变：世界与形象使用原 LocalService/SQLite 事务；记忆由 MemoryModule/OB 管理；TUpdate 管理设备更新配置、HTTPS、缓存和系统安装器。更新缓存与业务存档分离。发布脚本先验证原签名 APK、提交标识、完整源码和附件摘要，附件全部上传后公开 Release，最后推进静态清单；重试沿用相同构建。

升级入口：设置 → 关于与更新 → 检查更新 → 下载并安装新版。首次允许安装来源后返回继续安装。可以覆盖 0.13.2 或本地 0.14.0，保留原包名 `io.jcin.tcompanion` 与试用签名。安装前可导出备份，不要卸载。

回归：122 项 Node、103 项 Python（警告按错误），更新页面与世界表情/皮肤/历史浏览器流程通过。Android 验收使用合成人物和专用模拟器，`trial-upgrade-android.mjs` 对比完整业务文档及加密密钥文件指纹；`UpdateTransferInstrumentation` 检查中断/续传/暂停；`update-ui-android.mjs` 检查旧 WebView 的跨页面共享任务。真实默认渠道的发布后结果另记到 UPDATE_CHANNEL.md。

发布后实测：默认渠道发现、真实公网 APK 下载校验、来源授权、系统安装器覆盖、完整存档及加密凭据保留、新版报告已是最新全部通过；主包源码提交与七项附件摘要见 [已发布验收](UPDATE_CHANNEL.md#0141-世界整合版已发布验收2026-10-23)。

原 0.14.0 的真机、真实模型、自然后台调度、系统选图完整流程限制保留，本轮不扩大美术与世界规则范围。测试不调用付费模型。
