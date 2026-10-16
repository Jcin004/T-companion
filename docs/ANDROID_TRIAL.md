# Android 试用

> 本文为 0.2.0 后端式试用版历史说明。0.3.0 默认手机本地聊天，请读 [本机客户端说明](LOCAL-ANDROID.md)。

## 构建

采用 Capacitor 7.6.9，内置网页资源。三个 App 共用一个 APK；角色、记录和全局配置都从共同后端读取。首次打开无需先加载远程网页，后端不可达时仍可打开设置并修改地址。

要求 Node.js 20+、JDK 21、Android SDK Platform 35 / Build Tools 35、Gradle 8.11.1。安装精确 JavaScript 依赖后生成资源并构建：

```powershell
npm ci
npm run android:sync
# JAVA_HOME 指向 JDK 21；ANDROID_HOME 指向 Android SDK。
.\android\gradlew.bat -p android assembleDebug --no-daemon
```

生成 `android/app/build/outputs/apk/debug/app-debug.apk`。这是调试签名的个人试用版，非应用商店发行签名。分发时附带匹配的源码 ZIP、LICENSE 和 THIRD_PARTY_NOTICES；正式版本使用自己的签名密钥，私钥不能入库。Gradle ZIP 由官方 SHA-256 固定校验；下载镜像不改变校验值。

本机交付文件用 `scripts/sign-trial.ps1` 和仅在 `data/signing/` 保存的个人试用密钥重新签名并校验，后续试用更新可继续沿用这把密钥。GitHub CI 原始调试包的签名不保证跨运行一致；不要把它与本机重新签名的试用包混装升级。使用此脚本时传入 `InputApk`、`OutputApk`、`JavaHome` 和 `BuildTools` 的绝对路径。

## 本机后端

```powershell
.\scripts\setup-lan-tls.ps1 -Addresses '电脑的局域网IPv4'
.\scripts\start.ps1 -Https -Bind '0.0.0.0'
# 管理员 PowerShell，首次设置专用规则：
.\scripts\configure-firewall.ps1 -LocalAddress '电脑的局域网IPv4'
```

启动器同时运行桌面 HTTP 8000 和手机 HTTPS 8443，数据库为 `data/chat.db`。重复启动会被进程锁阻止；更新后使用 `-Restart`。重启会把中断生成变为可重试失败。不要并行启动另一套 uvicorn 访问此数据库。

若使用自己的公信 HTTPS 域名，只需让它连接同一后端，APK 无需修改。没有创建公共隧道或修改现有基础设施。

## 手机安装与连接

1. 手机与电脑连接允许相互访问的网络，安装试用 APK。
2. 局域网开发证书方案：将 **`data/tls/ca.crt` 公钥证书**传到手机，在 Android“安全 / 加密与凭据 / 安装证书 / CA 证书”中安装。系统会提示其信任范围；不要传输 `ca-key.pem` 或 `server-key.pem`。也可以直接使用自己的公信 HTTPS 地址，无需安装开发 CA。
3. APK → 设置 → 共同后端：填写 `https://电脑局域网IPv4:8443`，访问口令填写本机 `data/access-token.txt` 的内容，点击“保存并测试连接”。不要使用手机 `127.0.0.1` 代指电脑。
4. 在默认模型连接中填写服务商地址、模型名和密钥，保存后测试。在名册选择角色发起聊天。网页连接同一后端后将显示相同记录。

当前安装的 LAN 地址、验收结果和产物位置见 `docs/DELIVERY.md`。IP 变化后重新生成服务器证书并检查专用防火墙规则；原 CA 不会被重新生成。

试用包不忽略 SSL 错误，禁用明文 HTTP、WebView 调试和 Android 系统备份。访问口令保存在应用沙箱的设备存储；模型密钥始终只在后端。系统朗读、系统文件保存、Android 返回键由轻量原生桥接提供。可选系统声音取决于设备安装的 TTS 引擎。

## 撤销本机试用网络入口

```powershell
# 仅删除本次创建的规则：
Remove-NetFirewallRule -Name TCompanionTrialHTTPS8443
```

停止本项目后台服务，并按需在手机中移除 TCompanion Local Development CA。独立试用目录、数据库和备份由用户自行保留。
