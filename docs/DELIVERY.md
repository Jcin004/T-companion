# 联系人式聊天交付记录

> 本文记录 0.2.0。当前 0.3.0 的验收与产物见 [本机版交付记录](DELIVERY_LOCAL.md)。

日期：2026-10-15（Asia/Shanghai）。工作区：`E:/codex/AI-Projects/T-chat-mvp`，分支：`feat/chat-mvp`，PR：<https://github.com/Jcin004/T-/pull/1>。

## 已验证

- Python：84 项测试通过，开启 `-W error`，无警告。
- JavaScript：2 项 SSE 解析回归测试通过。
- 浏览器：桌面 1280×860、手机 390×844，隔离的模拟模型服务和 600 条历史记录。通过发送、幂等重试、草稿、角色创建、关键词和日历跳转、上下文连续浏览。上滑加载后视口锚点偏移不超过 2 像素；消息渲染窗口上限 160 条。
- 局域网 HTTPS：证书验证成功；无口令返回 401，带口令返回 200。桌面和 HTTPS 监听使用同一服务进程、同一数据库。
- 当前服务：桌面 <http://127.0.0.1:8000/>；手机后端 `https://<电脑局域网IPv4>:8443`（地址随网络变化）。专用 Windows 防火墙规则 `TCompanionTrialHTTPS8443` 仅开放指定 LAN IP 的 8443、Python 程序和本地子网。
- 原数据库快照：`data/backups/before-companion-20261015.db`。原目录 `T-` 的其他分支不改动，`sources/` 不改动。

## 真实模型验收

当前后端尚未配置真实模型密钥。全部开发验收使用模拟服务，未产生付费调用。真实聊天代码调用 OpenAI 兼容 Chat Completions 流式接口；使用者须在设置中配置并测试自己的连接后进行真实模型验收。

## Android 试用产物

- 安装包：`artifacts/T-companion-0.2.0-trial.apk`。
- 对应源码：`artifacts/T-companion-0.2.0-source.zip`，同时提供 LICENSE 和第三方署名。
- APK SHA-256：`5f892fa38285e63e57152692bc9eac9405fed7b3e8006982d988f348f82d6790`。
- 原生壳由 [GitHub CI 38706078805](https://github.com/Jcin004/T-/actions/runs/38706078805) 在提交 `036f477` 构建成功。本机 SDK 35 下载遇到连接重置，采用 CI 原生壳、当前仓库内置网页资源、`package-web-assets.py`、zipalign 和个人试用密钥完成交付。签名密钥在受 ACL 保护的 `data/signing/`，不进入安装包或源码包。
- 签名验证通过 v1 / v2 / v3，zipalign 检查通过。apksigner 对部分 META-INF 版本元数据报告 v1 签名提示，验证退出码为 0；完整输出见本机 `artifacts/signing-verification.log`。构建使用的 Capacitor 模板还带有 flatDir / Gradle 弃用提示。
- 在 Android 11 / API 30、WebView 83 的 Pixel 5 模拟器中实际安装、启动、更新安装，检查三个 App 导航、系统返回键和旧 WebView 兼容。开发 CA 仅加入此隔离模拟器的用户信任库，应用仍校验 TLS，没有忽略证书错误。
- APK 成功读取实际共同后端的角色列表。模拟器随后连接独立 HTTPS 模拟服务，通过真实 SSE 路由发送 `Android-stream-check`，确认用户消息和助手回复保存，实际用户数据库未加入测试消息。
- 原生导出经 Android 系统文件保存窗口将 602 条模拟记录保存到“下载”目录；读取 JSON 校验成功，未包含模型密钥。真实手机安装、设备自身声音可用性和用户模型验收仍由使用者完成。

同目录提供便于传输的试用 ZIP、公钥 CA、校验文件和连接说明；不包含访问口令、模型密钥、数据库或签名私钥。

截图保存在本机 `artifacts/`（不入 Git）：`chat-desktop.png`、`roster-desktop.png`、`settings-desktop.png`、`contacts-mobile.png`、`chat-mobile.png`、`android-chat.png`、`android-roster.png`、`android-save-dialog.png`。

手机安装与连接见 [Android 试用说明](ANDROID_TRIAL.md)。开发 CA 公钥为 `data/tls/ca.crt`，后端访问口令为 `data/access-token.txt`；两者不提交 Git，私钥不传到手机。

## 本机入口与范围

原 `T-chat-local/启动聊天.cmd` 继续可用；其 `start.ps1` 已改为调用新版启动器并复用运行中的服务。`配置模型.cmd` 改为打开网页，通过设置 App 配置。修改前均保留 `before-companion-20261015` 副本，避免旧入口继续编辑已不作为权威配置的 `.env`。

仅继续聊天 MVP 和 Android 试用，不合并其他分支，不引入长期记忆、世界或自主系统。原 `T-` 工作区和只读参考目录保持原状。
