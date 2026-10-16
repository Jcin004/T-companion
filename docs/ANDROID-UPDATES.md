# Android 应用更新（0.5.0 历史实现）

当前 0.6.1：私有手动更新，线上渠道未发布。原生 info 返回 channelPublished=false，check 不访问网络；界面显示“在线更新未启用”。以下发布流程仅作为未来部署参考，当前没有执行。详见 OPTIMIZATION-0.6.1.md。

入口：设置 → 关于与更新 → 检查更新。参照 SullyOS 的产品流程独立实现，不复制其更新代码。

程序读取 `https://api.github.com/repos/Jcin004/T-companion-updates/releases?per_page=100`，包括已发布的试用版，跳过草稿，选择附件 `t-update.json` 中最大的 versionCode。私有 T- 代码仓库不会作为匿名手机下载源。发布仓库不存在或未公开时，明确提示渠道尚未发布；断网、限流、缺失附件也不会显示“已是最新版”。已有发布但无更新清单时显示“尚无已发布的安装包”。

清单包含 schemaVersion=1、packageName、versionCode、versionName、apkUrl、sha256、sizeBytes、releaseNotes。所有下载和重定向必须为 HTTPS，不使用模型 API 密钥。清单最多 2 MB，APK 最多 200 MB。原生工作线程下载到应用私有缓存，展示实际字节进度，校验大小、哈希、包名、版本和当前签名。安装前再次校验。校验成功的安装包和清单可跨进程恢复；重复点击不会并发下载，失败可重试。

Android 8+ 首次安装更新时，打开“允许来自此来源的应用”页面。允许后返回 T-，点击“继续安装”。系统安装器由用户确认；取消后可再次打开。应用不会在打开安装器时宣称安装成功。首次从 0.4.0 升到 0.5.0 仍需手动覆盖，因为旧包不包含更新器。无需卸载，原签名与包名保持一致。

## 发布准备

每版提升 versionCode，并保留 `data/signing` 内的原签名文件（不得上传）。构建并签名 APK 后执行：

```powershell
node scripts/prepare-update.mjs artifacts/T-companion-0.5.0-trial.apk 5 0.5.0-trial android-v0.5.0
git archive --format=zip --output=artifacts/T-companion-0.5.0-source.zip HEAD
```

审核后在公开的 `Jcin004/T-companion-updates` 发布 `android-v0.5.0` Release，上传签名 APK、`t-update.json`、对应完整源码、许可证、第三方署名及构建说明。更新源只读取发布内容；发布草稿不可作为手机下载源。源码不得包含 `.env`、签名私钥、本机数据和模型密钥。准备脚本不进行网络发布，也不更改代码仓库可见性。

## 验证

- `node tests/app-update-browser.mjs`：检查新版、下载中断重试、权限返回、取消安装后重开、重启缓存恢复、浏览器提示；模拟 Capacitor 的同步监听句柄。
- `UpdateInstrumentation`：隔离模拟器，使用真实签名 APK、PackageManager 与文件写入，模拟 HTTPS 响应流；测试错误哈希、大小、HTTP、版本回退、错误签名拦截，以及正确下载、进度、恢复清单和校验。
- 构建测试用旧版本：`-PtrialVersionCode=4 -PtrialVersionName=0.4.0-trial`；测试 APK 使用 `-PupdateTestRunner=io.jcin.tcompanion.UpdateInstrumentation`，与主 APK 以同一测试签名签名。把 0.5.0 正确签名和错误签名测试包放进隔离应用 files 下的 `update-good.apk`、`update-bad.apk` 后执行 `adb shell am instrument -w io.jcin.tcompanion.test/io.jcin.tcompanion.UpdateInstrumentation`。测试包不随正式分发包发布。
- Android 系统权限、系统安装器覆盖升级及数据保留另行执行 UI 验证。真实互联网渠道需在发布后以匿名访问再次验收；模拟传输不代表公网下载成功。
- 本次模拟器实际完成：首次授权安装来源 → 返回继续安装 → 系统安装器取消 → 再次打开 → 覆盖升级 0.4 至 0.5。完整聊天 JSON 和加密凭据文件哈希保持一致。公网渠道尚未发布，需要用户批准公开下载仓库与分发文件后验收。

参考：[SullyOS 更新流程](https://github.com/Jcin004/SullyOS/blob/master/utils/androidAppUpdate.ts)、[Android 安装来源权限](https://developer.android.com/reference/android/content/pm/PackageManager#canRequestPackageInstalls())。
