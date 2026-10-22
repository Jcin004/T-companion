# 文件职责与布局评价

这份清单覆盖本分支纳入源码管理的每个文件。`data/`、`.env`、`node_modules/`、`dist/` 和签名材料不在清单中：分别是私人运行数据、环境配置、安装依赖或生成结果。

## 布局评价

目前按界面、本机业务、Python 后端、Android 适配、测试和构建分组，方向合理。记忆、外观、日志已有独立入口；第三方代码及许可也有单独位置。

仍需逐步改善的地方：

- `app.js` 同时负责聊天、导航、历史和名册界面，后续在修改相应流程时按完整界面职责拆分。
- `local-service.js` 同时负责命令、事务、存储和传输；本轮只把只读查询移到 `local-queries.js`。后续可在真实平台差异处拆出存储/传输适配，不按按钮拆文件。
- `diagnostics.js` 包含日志业务和界面，`api/companion.py` 也较大；在相关功能改动时再收口。
- JavaScript 本机和 Python 后端各有规则实现；通过共同场景约束差异，目前并非一个共享主脑。
- 早期文档、旧 API 和旧脚本仍保留。当前入口是 `CURRENT_ARCHITECTURE.md`；旧入口是否退役应另做范围明确的兼容检查。

本轮迁移保留 `local-service.js` 对 `buildContext` 的导出；原有调用与测试仍能使用。没有删除聊天、记忆或设备功能，没有引入新第三方依赖。

## 主要依赖方向

```text
界面 → LocalService 查询/命令 → 只读查询或业务规则
                             → 事务队列 → 浏览器/Android 存储
聊天/整理 → 模型传输；日志 → 独立日志存储
可选共同后端 → FastAPI → Python 规则与 SQLite
```

## 逐文件清单

### 项目入口与规范

| 文件 | 内容与责任 |
|---|---|
| [.env.example](../.env.example) | 后端环境变量模板，只放空值或示例；不是用户实际密钥。 |
| [.gitattributes](../.gitattributes) | Git 文本编码和换行约定。 |
| [.github/PULL_REQUEST_TEMPLATE.md](../.github/PULL_REQUEST_TEMPLATE.md) | PR 说明模板：问题、架构、验证、复用与隐私。 |
| [.github/workflows/tests.yml](../.github/workflows/tests.yml) | GitHub 自动测试、密钥扫描和 Android 调试构建。 |
| [.gitignore](../.gitignore) | 排除密钥、聊天数据库、依赖、构建结果及签名材料。 |
| [AGENTS.md](../AGENTS.md) | AI 开发约定：职责、隐私、回归、提交和交付。 |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 人工与 AI 共用的开发、错误处理、测试及文件规范。 |
| [GLOSSARY.md](../GLOSSARY.md) | 人物、名册、记忆、知情范围等术语。 |
| [LICENSE](../LICENSE) | 本项目 AGPL-3.0-only 许可证。 |
| [README.md](../README.md) | 使用、启动、安装与当前能力入口。 |
| [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) | 第三方代码逐项来源、版本、许可及改动记录。 |
| [capacitor.config.json](../capacitor.config.json) | Web 资源目录与 Android 应用标识。 |
| [package-lock.json](../package-lock.json) | 锁定 npm 依赖树。 |
| [package.json](../package.json) | 前端依赖版本和测试、构建命令；private 表示不发布 npm 包，不表示 GitHub 私有。 |
| [pytest.ini](../pytest.ini) | Python 测试收集范围。 |

### 前端

| 文件 | 内容与责任 |
|---|---|
| [frontend/app-update.js](../frontend/app-update.js) | 更新状态、下载/安装交互和中文错误提示；渠道未发布。 |
| [frontend/app.js](../frontend/app.js) | 界面入口：导航、聊天展示、历史搜索/日历、名册表单与各 App 接线；仍偏大。 |
| [frontend/chat-style.js](../frontend/chat-style.js) | 分条展示、动作/表情/语音标签和表达策略规则。 |
| [frontend/context-policy.js](../frontend/context-policy.js) | 全局/会话上下文条数范围与继承规则。 |
| [frontend/desktop.css](../frontend/desktop.css) | 小手机桌面、图标、外观和相关界面样式。 |
| [frontend/diagnostics.js](../frontend/diagnostics.js) | 日志收集、限量、脱敏、存储适配和日志 App 界面；可后续拆分界面。 |
| [frontend/index.html](../frontend/index.html) | 小手机桌面、聊天、名册、设置等基础页面结构。 |
| [frontend/legal.html](../frontend/legal.html) | 生成后的离线许可页面，构建时更新。 |
| [frontend/licenses/Apache-2.0.txt](../frontend/licenses/Apache-2.0.txt) | 依赖许可文本。 |
| [frontend/licenses/Serein-MIT.txt](../frontend/licenses/Serein-MIT.txt) | Serein 相关 MIT 许可文本。 |
| [frontend/local-queries.js](../frontend/local-queries.js) | 只读人物/名册原文、外观、上下文预览和来源定位；实际聊天共用上下文组装。 |
| [frontend/local-service.js](../frontend/local-service.js) | 本机命令路由、事务队列、聊天编排及浏览器/Android 存储和传输适配；仍偏大。 |
| [frontend/memory-core.js](../frontend/memory-core.js) | 来源验证、记忆校验、时间分日、名册原文投影和召回材料规则。 |
| [frontend/memory-lexical.js](../frontend/memory-lexical.js) | 从 Serein 适配的 BM25 关键词召回与索引缓存。 |
| [frontend/memory-links.js](../frontend/memory-links.js) | 有向关联、端点归属与版本校验、删除清理的纯规则。 |
| [frontend/memory-links-ui.js](../frontend/memory-links-ui.js) | 记忆与核心标签关联的创建、查看、编辑和删除界面。 |
| [frontend/memory-service.js](../frontend/memory-service.js) | 整理、总结、核心标签、版本及水位；模型调用在事务外，提交走统一写入口。 |
| [frontend/memory-ui.js](../frontend/memory-ui.js) | 记忆/自我 App、编辑器、版本记录、日历总结的界面操作。 |
| [frontend/memory.css](../frontend/memory.css) | 记忆、自我与每日总结界面样式。 |
| [frontend/model-json.js](../frontend/model-json.js) | 模型 JSON 包装清理与 jsonrepair 适配，结果仍由业务校验。 |
| [frontend/model-profiles.js](../frontend/model-profiles.js) | 连接元数据初始化和服务地址、模型、分组校验，不保存密钥。 |
| [frontend/preferences-ui.js](../frontend/preferences-ui.js) | 外观 App、模型连接分组切换与聊天风格界面。 |
| [frontend/runtime-rules.js](../frontend/runtime-rules.js) | 客户端固定运行约束；与用户人物设定分开。 |
| [frontend/sse-json.js](../frontend/sse-json.js) | 复用 float 的 SSE/JSON 流解析，保留原始空白。 |
| [frontend/style.css](../frontend/style.css) | 基础页面、表单、聊天和响应式样式。 |
| [frontend/vendor/jsonrepair/LICENSE.md](../frontend/vendor/jsonrepair/LICENSE.md) | 供应商 ISC 许可证原文。 |
| [frontend/vendor/jsonrepair/provenance.json](../frontend/vendor/jsonrepair/provenance.json) | 供应商版本、来源和文件摘要。 |
| [frontend/vendor/jsonrepair/regular/jsonrepair.js](../frontend/vendor/jsonrepair/regular/jsonrepair.js) | 供应商 JSON 语法修复实现，保持原样。 |
| [frontend/vendor/jsonrepair/utils/JSONRepairError.js](../frontend/vendor/jsonrepair/utils/JSONRepairError.js) | 供应商解析错误类型。 |
| [frontend/vendor/jsonrepair/utils/stringUtils.js](../frontend/vendor/jsonrepair/utils/stringUtils.js) | 供应商字符串解析工具。 |

### Python 后端

| 文件 | 内容与责任 |
|---|---|
| [backend/__init__.py](../backend/__init__.py) | Python 包标记，保持包导入路径。 |
| [backend/app/__init__.py](../backend/app/__init__.py) | Python 包标记，保持包导入路径。 |
| [backend/app/agent_runtime/__init__.py](../backend/app/agent_runtime/__init__.py) | Python 包标记，保持包导入路径。 |
| [backend/app/agent_runtime/runtime.py](../backend/app/agent_runtime/runtime.py) | 早期身份约束与模型执行流程，仍由旧接口使用。 |
| [backend/app/api/__init__.py](../backend/app/api/__init__.py) | Python 包标记，保持包导入路径。 |
| [backend/app/api/backup.py](../backend/app/api/backup.py) | 后端备份、校验与恢复接口。 |
| [backend/app/api/chat.py](../backend/app/api/chat.py) | 早期单次聊天 HTTP 接口。 |
| [backend/app/api/companion.py](../backend/app/api/companion.py) | 当前共同后端人物、联系人、模型设置、聊天流、搜索和日历接口；仍偏大。 |
| [backend/app/api/sessions.py](../backend/app/api/sessions.py) | 早期会话/消息接口。 |
| [backend/app/character/__init__.py](../backend/app/character/__init__.py) | Python 包标记，保持包导入路径。 |
| [backend/app/character/provider.py](../backend/app/character/provider.py) | 从 YAML 读取并严格校验人物 Canon/Persona。 |
| [backend/app/companion_store.py](../backend/app/companion_store.py) | 可选共同后端的 SQLite 人物、联系人、消息、配置与轮次存储。 |
| [backend/app/config/__init__.py](../backend/app/config/__init__.py) | Python 包标记，保持包导入路径。 |
| [backend/app/config/settings.py](../backend/app/config/settings.py) | 环境变量、后端模型和部署配置。 |
| [backend/app/context/__init__.py](../backend/app/context/__init__.py) | Python 包标记，保持包导入路径。 |
| [backend/app/context/builder.py](../backend/app/context/builder.py) | Python 端人物身份与附加指令的上下文构建。 |
| [backend/app/contracts.py](../backend/app/contracts.py) | Canon/Persona、模型消息等 Python 数据契约。 |
| [backend/app/errors.py](../backend/app/errors.py) | 运行时、配置和模型错误类型。 |
| [backend/app/main.py](../backend/app/main.py) | FastAPI 装配、权限、错误处理和静态前端挂载；连接旧运行时与陪伴后端。 |
| [backend/app/model/__init__.py](../backend/app/model/__init__.py) | Python 包标记，保持包导入路径。 |
| [backend/app/model/base.py](../backend/app/model/base.py) | Python 模型适配接口。 |
| [backend/app/model/openai_provider.py](../backend/app/model/openai_provider.py) | OpenAI 兼容模型适配及客户端生命周期。 |
| [backend/app/serve.py](../backend/app/serve.py) | 同一后端进程的本机 HTTP 与可选 HTTPS 监听。 |
| [backend/app/source.py](../backend/app/source.py) | 按确定 Git 提交导出源码，拒绝递归打包私密运行目录。 |
| [backend/app/storage.py](../backend/app/storage.py) | 旧会话存储实现；CompanionStore 在此基础上扩展。 |
| [backend/requirements-lock.txt](../backend/requirements-lock.txt) | Python 固定依赖版本。 |
| [backend/requirements.txt](../backend/requirements.txt) | Python 直接依赖。 |

### Android

| 文件 | 内容与责任 |
|---|---|
| [android/.gitignore](../android/.gitignore) | 排除 Android 本地配置和构建产物。 |
| [android/app/.gitignore](../android/app/.gitignore) | 排除 Android 本地配置和构建产物。 |
| [android/app/build.gradle](../android/app/build.gradle) | Android/Capacitor 工程构建及依赖装配配置。 |
| [android/app/capacitor.build.gradle](../android/app/capacitor.build.gradle) | Android/Capacitor 工程构建及依赖装配配置。 |
| [android/app/proguard-rules.pro](../android/app/proguard-rules.pro) | Android 混淆/压缩规则。 |
| [android/app/src/androidTest/java/io/jcin/tcompanion/UpdateInstrumentation.java](../android/app/src/androidTest/java/io/jcin/tcompanion/UpdateInstrumentation.java) | Android 更新模块的设备端检查。 |
| [android/app/src/main/AndroidManifest.xml](../android/app/src/main/AndroidManifest.xml) | Android 应用、组件、权限与网络配置声明。 |
| [android/app/src/main/java/io/jcin/tcompanion/MainActivity.java](../android/app/src/main/java/io/jcin/tcompanion/MainActivity.java) | Android 主页面、插件注册和返回键接线。 |
| [android/app/src/main/java/io/jcin/tcompanion/TDevicePlugin.java](../android/app/src/main/java/io/jcin/tcompanion/TDevicePlugin.java) | 系统声音、文件导入/导出和相关 Android 操作。 |
| [android/app/src/main/java/io/jcin/tcompanion/TLocalPlugin.java](../android/app/src/main/java/io/jcin/tcompanion/TLocalPlugin.java) | 手机 SQLite、Keystore 凭据、原生流式请求与日志存储。 |
| [android/app/src/main/java/io/jcin/tcompanion/TUpdatePlugin.java](../android/app/src/main/java/io/jcin/tcompanion/TUpdatePlugin.java) | 原生更新检查、下载校验与安装权限；发布开关仍关闭。 |
| [android/app/src/main/res/drawable-land-hdpi/splash.png](../android/app/src/main/res/drawable-land-hdpi/splash.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/drawable-land-mdpi/splash.png](../android/app/src/main/res/drawable-land-mdpi/splash.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/drawable-land-xhdpi/splash.png](../android/app/src/main/res/drawable-land-xhdpi/splash.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/drawable-land-xxhdpi/splash.png](../android/app/src/main/res/drawable-land-xxhdpi/splash.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/drawable-land-xxxhdpi/splash.png](../android/app/src/main/res/drawable-land-xxxhdpi/splash.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/drawable-port-hdpi/splash.png](../android/app/src/main/res/drawable-port-hdpi/splash.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/drawable-port-mdpi/splash.png](../android/app/src/main/res/drawable-port-mdpi/splash.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/drawable-port-xhdpi/splash.png](../android/app/src/main/res/drawable-port-xhdpi/splash.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/drawable-port-xxhdpi/splash.png](../android/app/src/main/res/drawable-port-xxhdpi/splash.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/drawable-port-xxxhdpi/splash.png](../android/app/src/main/res/drawable-port-xxxhdpi/splash.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml](../android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml) | Android 图标、背景或启动资源定义。 |
| [android/app/src/main/res/drawable/ic_launcher_background.xml](../android/app/src/main/res/drawable/ic_launcher_background.xml) | Android 图标、背景或启动资源定义。 |
| [android/app/src/main/res/drawable/ic_t.xml](../android/app/src/main/res/drawable/ic_t.xml) | Android 图标、背景或启动资源定义。 |
| [android/app/src/main/res/drawable/splash.png](../android/app/src/main/res/drawable/splash.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/layout/activity_main.xml](../android/app/src/main/res/layout/activity_main.xml) | Android WebView 页面宿主布局。 |
| [android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml](../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml) | Android 图标、背景或启动资源定义。 |
| [android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml](../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml) | Android 图标、背景或启动资源定义。 |
| [android/app/src/main/res/mipmap-hdpi/ic_launcher.png](../android/app/src/main/res/mipmap-hdpi/ic_launcher.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png](../android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png](../android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-mdpi/ic_launcher.png](../android/app/src/main/res/mipmap-mdpi/ic_launcher.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png](../android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png](../android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-xhdpi/ic_launcher.png](../android/app/src/main/res/mipmap-xhdpi/ic_launcher.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png](../android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png](../android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png](../android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png](../android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png](../android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png](../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png](../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png](../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png) | Android 启动图或图标资源，按屏幕方向和像素密度提供。 |
| [android/app/src/main/res/values/ic_launcher_background.xml](../android/app/src/main/res/values/ic_launcher_background.xml) | Android 图标、背景或启动资源定义。 |
| [android/app/src/main/res/values/strings.xml](../android/app/src/main/res/values/strings.xml) | Android 应用名称和字符串资源。 |
| [android/app/src/main/res/values/styles.xml](../android/app/src/main/res/values/styles.xml) | Android 启动及窗口样式。 |
| [android/app/src/main/res/xml/file_paths.xml](../android/app/src/main/res/xml/file_paths.xml) | Android 文件分享/安装可访问的目录。 |
| [android/app/src/main/res/xml/network_security_config.xml](../android/app/src/main/res/xml/network_security_config.xml) | Android 网络安全规则。 |
| [android/build.gradle](../android/build.gradle) | Android/Capacitor 工程构建及依赖装配配置。 |
| [android/capacitor.settings.gradle](../android/capacitor.settings.gradle) | Android/Capacitor 工程构建及依赖装配配置。 |
| [android/gradle.properties](../android/gradle.properties) | Android/Gradle 构建选项。 |
| [android/gradle/wrapper/gradle-wrapper.jar](../android/gradle/wrapper/gradle-wrapper.jar) | 固定 Gradle 启动器二进制。 |
| [android/gradle/wrapper/gradle-wrapper.properties](../android/gradle/wrapper/gradle-wrapper.properties) | Gradle 发行版地址与版本。 |
| [android/gradlew](../android/gradlew) | Unix Gradle 启动器。 |
| [android/gradlew.bat](../android/gradlew.bat) | Windows Gradle 启动器。 |
| [android/settings.gradle](../android/settings.gradle) | Android/Capacitor 工程构建及依赖装配配置。 |
| [android/variables.gradle](../android/variables.gradle) | 共享 Android SDK 等构建版本。 |

### 构建与维护脚本

| 文件 | 内容与责任 |
|---|---|
| [scripts/audit_publication.py](../scripts/audit_publication.py) | 检查提交历史、密钥、私人邮箱、设备路径和可选 GitHub 元数据。 |
| [scripts/build-legal.mjs](../scripts/build-legal.mjs) | 当前构建使用的 Node 许可页面生成器。 |
| [scripts/build-legal.py](../scripts/build-legal.py) | 早期 Python 许可页生成器；保留但不再作为当前构建入口。 |
| [scripts/build-web.mjs](../scripts/build-web.mjs) | 生成许可页并把前端复制到 dist，供网页/Capacitor 构建。 |
| [scripts/configure-firewall.ps1](../scripts/configure-firewall.ps1) | 可选局域网监听的 Windows 防火墙配置。 |
| [scripts/package-web-assets.py](../scripts/package-web-assets.py) | 把构建后的 Web 资源装入 APK，输出另一个待签名安装包。 |
| [scripts/prepare-update.mjs](../scripts/prepare-update.mjs) | 准备 APK 更新清单、哈希和大小，不代表更新渠道已发布。 |
| [scripts/setup-lan-tls.ps1](../scripts/setup-lan-tls.ps1) | 可选局域网 HTTPS 证书配置。 |
| [scripts/sign-trial.ps1](../scripts/sign-trial.ps1) | 用忽略目录中的试用签名材料签署 APK；密钥不进仓库。 |
| [scripts/start.ps1](../scripts/start.ps1) | Windows 使用现有 .venv 启动、重启后端并记录日志的入口。 |
| [scripts/vendor-jsonrepair.mjs](../scripts/vendor-jsonrepair.mjs) | 按固定依赖复制并记录供应商 JSON 修复文件。 |

### 测试

| 文件 | 内容与责任 |
|---|---|
| [backend/tests/__init__.py](../backend/tests/__init__.py) | Python 包标记，保持包导入路径。 |
| [backend/tests/conftest.py](../backend/tests/conftest.py) | Python 测试共用隔离数据与模拟依赖。 |
| [backend/tests/test_api.py](../backend/tests/test_api.py) | 早期 HTTP 接口的逻辑回归测试。 |
| [backend/tests/test_character_provider.py](../backend/tests/test_character_provider.py) | YAML 人物验证的逻辑回归测试。 |
| [backend/tests/test_client_rules.py](../backend/tests/test_client_rules.py) | Python/JS 运行约束一致性的逻辑回归测试。 |
| [backend/tests/test_companion.py](../backend/tests/test_companion.py) | 共同后端聊天和记录的逻辑回归测试。 |
| [backend/tests/test_context_builder.py](../backend/tests/test_context_builder.py) | Python 上下文投影的逻辑回归测试。 |
| [backend/tests/test_context_limits.py](../backend/tests/test_context_limits.py) | 后端历史条数的逻辑回归测试。 |
| [backend/tests/test_model_adapter.py](../backend/tests/test_model_adapter.py) | 模型适配的逻辑回归测试。 |
| [backend/tests/test_publication_audit.py](../backend/tests/test_publication_audit.py) | 公开前扫描的逻辑回归测试。 |
| [backend/tests/test_runtime.py](../backend/tests/test_runtime.py) | 早期运行时的逻辑回归测试。 |
| [backend/tests/test_sessions.py](../backend/tests/test_sessions.py) | 旧会话持久化的逻辑回归测试。 |
| [backend/tests/test_settings.py](../backend/tests/test_settings.py) | 环境配置的逻辑回归测试。 |
| [backend/tests/test_source_export.py](../backend/tests/test_source_export.py) | 源码导出隐私的逻辑回归测试。 |
| [tests/app-update-browser.mjs](../tests/app-update-browser.mjs) | 更新状态与错误提示的浏览器验收。 |
| [tests/browser.mjs](../tests/browser.mjs) | 共同后端网页聊天的浏览器验收。 |
| [tests/browser_server.py](../tests/browser_server.py) | 使用隔离 SQLite 和模拟模型的后端浏览器验收宿主。 |
| [tests/context-browser.mjs](../tests/context-browser.mjs) | 上下文设置及实际请求的浏览器验收。 |
| [tests/context-policy.test.mjs](../tests/context-policy.test.mjs) | 本机历史条数规则的逻辑回归测试。 |
| [tests/desktop.mjs](../tests/desktop.mjs) | 小手机导航、独立聊天、记录和备份的浏览器验收。 |
| [tests/diagnostics-browser.mjs](../tests/diagnostics-browser.mjs) | 脱敏日志及上下文的浏览器验收。 |
| [tests/diagnostics.test.mjs](../tests/diagnostics.test.mjs) | 脱敏日志及上下文的逻辑回归测试。 |
| [tests/direct_model_server.py](../tests/direct_model_server.py) | 本机模拟流式模型服务器；不调用真实服务。 |
| [tests/local-queries.test.mjs](../tests/local-queries.test.mjs) | 只读查询、上下文与来源隔离的逻辑回归测试。 |
| [tests/local-service.test.mjs](../tests/local-service.test.mjs) | 本机聊天、幂等重试和记录的逻辑回归测试。 |
| [tests/local-transactions-browser.mjs](../tests/local-transactions-browser.mjs) | 事务、故障隔离和草稿的浏览器验收。 |
| [tests/local-transactions.test.mjs](../tests/local-transactions.test.mjs) | 事务、故障隔离和草稿的逻辑回归测试。 |
| [tests/memory-android.mjs](../tests/memory-android.mjs) | 来源记忆、总结与认同核心的Android 模拟器验收。 |
| [tests/memory-browser.mjs](../tests/memory-browser.mjs) | 来源记忆、总结与认同核心的浏览器验收。 |
| [tests/memory-links.test.mjs](../tests/memory-links.test.mjs) | 关联方向、人物隔离、备份兼容、版本复核和保存回滚测试。 |
| [tests/memory-links-browser.mjs](../tests/memory-links-browser.mjs) | 关联与标签依据的实际浏览器操作、来源跳转和刷新验收。 |
| [tests/memory.test.mjs](../tests/memory.test.mjs) | 来源记忆、总结与认同核心的逻辑回归测试。 |
| [tests/preferences-browser.mjs](../tests/preferences-browser.mjs) | 外观、连接分组与聊天风格的浏览器验收。 |
| [tests/preferences.test.mjs](../tests/preferences.test.mjs) | 外观、连接分组与聊天风格的逻辑回归测试。 |
| [tests/reuse-optimization.test.mjs](../tests/reuse-optimization.test.mjs) | 供应商固定版本、解析与 BM25的逻辑回归测试。 |
| [tests/sse.test.mjs](../tests/sse.test.mjs) | SSE 流解析的逻辑回归测试。 |

### 配置模板与文档

| 文件 | 内容与责任 |
|---|---|
| [config/character/canon.yaml](../config/character/canon.yaml) | 后端初始人物事实模板；不是模型可自动覆盖的记忆。 |
| [config/character/persona.yaml](../config/character/persona.yaml) | 后端初始人格倾向模板。 |
| [docs/ANDROID-UPDATES.md](../docs/ANDROID-UPDATES.md) | Android 更新协议及限制。 |
| [docs/ANDROID_TRIAL.md](../docs/ANDROID_TRIAL.md) | 早期 Android 试用记录。 |
| [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) | 早期总体架构愿景。 |
| [docs/CHARACTER_IDENTITY.md](../docs/CHARACTER_IDENTITY.md) | Canon/Persona 身份设计。 |
| [docs/CHAT_MVP.md](../docs/CHAT_MVP.md) | 聊天数据与状态协议。 |
| [docs/CURRENT_ARCHITECTURE.md](../docs/CURRENT_ARCHITECTURE.md) | 当前真实架构、数据流、问题和扩展路线。 |
| [docs/DATA_MODEL.md](../docs/DATA_MODEL.md) | 早期数据模型设计。 |
| [docs/DELIVERY.md](../docs/DELIVERY.md) | 早期交付与运行记录。 |
| [docs/DELIVERY_LOCAL.md](../docs/DELIVERY_LOCAL.md) | 本机模式交付记录。 |
| [docs/DIAGNOSTICS-0.5.md](../docs/DIAGNOSTICS-0.5.md) | 日志功能阶段记录。 |
| [docs/FEATURE_BASELINE.md](../docs/FEATURE_BASELINE.md) | 已有功能与回归检查清单。 |
| [docs/FILE_MAP.md](../docs/FILE_MAP.md) | 本文件：逐文件职责与布局评价。 |
| [docs/INTERFACE_DESIGN.md](../docs/INTERFACE_DESIGN.md) | 早期接口设计。 |
| [docs/LOCAL-ANDROID.md](../docs/LOCAL-ANDROID.md) | 本机模式和 Android 适配说明。 |
| [docs/MEMORY-LINKS.md](../docs/MEMORY-LINKS.md) | 记忆关联第一版的操作、数据契约、兼容与验证说明。 |
| [docs/MEMORY-0.6.md](../docs/MEMORY-0.6.md) | 来源记忆、总结与自我功能说明。 |
| [docs/MEMORY-COMPARISON.md](../docs/MEMORY-COMPARISON.md) | 参考记忆系统的比较。 |
| [docs/MODULE_DESIGN.md](../docs/MODULE_DESIGN.md) | 早期模块设计。 |
| [docs/OPTIMIZATION-0.6.1.md](../docs/OPTIMIZATION-0.6.1.md) | 0.6.1 优化与复用记录。 |
| [docs/PHASE_1_SPEC.md](../docs/PHASE_1_SPEC.md) | 最早运行时规格。 |
| [docs/PREFERENCES-0.4.md](../docs/PREFERENCES-0.4.md) | 外观、连接与聊天风格阶段说明。 |
| [docs/PRODUCT_VISION.md](../docs/PRODUCT_VISION.md) | 用户愿景与产品方向。 |
| [docs/PROGRESS.md](../docs/PROGRESS.md) | 历史阶段里程碑，不代表当前分支合并状态。 |
| [docs/PROJECT_CONTEXT.md](../docs/PROJECT_CONTEXT.md) | 早期项目背景。 |
| [docs/PUBLICATION_AUDIT.md](../docs/PUBLICATION_AUDIT.md) | 公开前隐私及历史审计记录。 |
| [docs/REFERENCE_PROJECTS.md](../docs/REFERENCE_PROJECTS.md) | 参考项目与调查记录。 |
| [docs/ROADMAP.md](../docs/ROADMAP.md) | 整体路线与未来阶段。 |
| [docs/python-dependencies.json](../docs/python-dependencies.json) | Python 依赖来源/许可资料，供许可生成器读取。 |

## 聊天文字操作与动作模板

- `frontend/text-editing.js`：消息及输入框的桌面右键菜单、剪贴板兼容处理；Android 长按仍交给系统。
- `frontend/chat-style.js`：每聊天动作模板的校验、占位符替换及表达策略；`chat-settings-ui.js` 通过联系人接口保存。
- `tests/chat-editing-browser.mjs`：模拟模型下验证菜单、模板保存及刷新后的实际请求。

## API 悬浮切换

- `frontend/api-floating-switcher.js`：App 内悬浮按钮、拖动和位置恢复，不拥有连接或密钥；选择操作复用 `model-profiles-ui.js` 的模型选择弹窗。
- `tests/api-floating-browser.mjs`：分组切换、实际请求连接、记忆连接隔离、拖动/刷新/尺寸变化和键盘操作。

## 可配置更新渠道

- `docs/UPDATE_CHANNEL.md`：更新器职责、设备配置、部署边界和复用记录。
- `tests/update-channel.test.mjs`：清单地址、敏感参数和数量上限校验。
- `android/app/src/androidTest/java/io/jcin/tcompanion/UpdateChannelInstrumentation.java`：隔离原生渠道发现及持久化验收。

## 本机记忆网召回

- `frontend/memory-evidence.js`：来源、逐字证据、名册快照；旧 memory-core 导出保持。
- `frontend/recall-cues.js`：Serein 衍生的指代/延续线索适配。
- `frontend/memory-recall.js`：人物隔离的只读召回计划、单跳关联、人工标签、预算与材料格式。
- `tests/memory-recall.test.mjs`、`tests/memory-recall-browser.mjs`、`tests/memory-recall-android.mjs`：领域、实际界面/请求和隔离模拟器原生 SQLite 验收。
- `docs/MEMORY_RECALL.md`：数据流、控制项、平台差异和范围。

## 0.8.1 设置职责

- `preferences-ui.js`：兼容挂载入口，组合外观与模型设置，不实现各自业务。
- `appearance-ui.js`：外观表单、图片选择和展示；通过现有本机设置接口保存。
- `model-profiles-ui.js`：模型预设、分组、选择弹窗及悬浮球接线；密钥仍交原凭据适配。
- `chat-settings-ui.js`：全局/单聊天上下文、聊天详情、表达开关和动作模板；复用 context-policy/chat-style 规则。
- `dialog-navigation.js`：原生对话框子页返回、退出时清理父页关系；不保存人物数据。
- `app.js`：聊天导航和编排入口，连接上述模块；移除重复模型表单保存处理。
- `tests/chat-settings-browser.mjs`：两个角色的实际上下文范围、直接输入、保存/刷新、返回层级与未保存表单保留。
- `docs/SETTINGS_FINISHING.md`：这轮优化范围和后续维护问题。

## AI 关联候选

- `frontend/memory-link-proposals.js`：选材上限、逐字依据、人物/版本校验与只读候选状态。
- `frontend/memory-link-proposal-service.js`：模型候选编排、去重、确认/拒绝，复用原事务和记忆连接。
- `frontend/memory-link-proposals-ui.js`：显式勾选、候选展示、调整确认和已处理记录；不直接读取业务文档。
- `tests/memory-link-proposals.test.mjs`、`tests/memory-link-proposals-browser.mjs`、`tests/memory-link-proposals-android.mjs`：状态隔离、证据、失败原子性、实际界面/模拟请求和原生 SQLite 验收。
- `docs/MEMORY_LINK_PROPOSALS.md`：当前契约、复用核对及范围。

## Android 内置记忆

- `frontend/embedded-memory.js`：本机命令适配、快照、候选范围核对及引擎状态，无远程地址。
- `frontend/embedded-memory-ui.js`：运行状态说明；卡片和设置继续用既有界面。
- `TMemoryPlugin.java`：单线程 Python 执行桥，无联网、密钥及业务数据库逻辑。
- `android/app/src/main/python/t_memory.py`：OB 派生缓存协调、路径适配、按快照 CRUD、自动浮现策略和时间评分适配。
- `vendor/python/`：固定版 OB、RapidFuzz Python 和 jieba 核心，原文件不改；配套目录保留逐文件来源与许可。
- `config/requirements-ob-*.txt`：构建端及主机测试依赖；手机不安装依赖。
- `tests/embedded-*.test.mjs`、`tests/test_embedded_ob.py`：事务、原核心与来源完整性检查。
- `tests/embedded-ob-android.mjs`、`EmbeddedMemoryInstrumentation.java`：独立模拟器完整验收与原生装载检查。

## 最小世界新增文件

| 文件 | 职责 |
|---|---|
| frontend/world-map.js | 原创房间几何、地点、碰撞网格 |
| frontend/world-pathfinding.js | Alicization Town A* 的 ESM 适配，算法未改 |
| frontend/vendor/alicization-town/* | 原版寻路、完整许可和逐文件来源 |
| frontend/world-core.js | 世界状态验证、移动/交互、事件、观察、场景快照 |
| frontend/world-service.js | 世界读写接口与统一事务接入 |
| frontend/world-renderer.js | 原创 Canvas 像素美术，只读取世界投影 |
| frontend/world-ui.js、world.css | 桌面世界入口、触屏操作、场景对话与来源呈现 |
| frontend/world-joystick.js | 摇杆指针、方向、连续单步与取消；不持有世界数据或存储 |
| tests/world.test.mjs | 持久化/隔离/失败/去重/上下文/来源/复用测试 |
| tests/world-browser.mjs | 模拟模型与手机触屏网页验收 |
| tests/world-android.mjs | 专用模拟器原签名升级、真实 SQLite/OB 与触屏验收 |
| docs/MINIMAL_PIXEL_WORLD.md | 模块所有者、接口、来源、使用及验证 |

## 0.12.0 居民生活文件

| 文件 | 所有者/职责 |
|---|---|
| resident-life-core.js / resident-headless.js | 无 DOM 的有限任务状态机与原生调用口 |
| resident-life-service.js / resident-life-ui.js | 浏览器编排与世界设置界面 |
| resident-lock.js / resident-perception.js | 上游 Promise 锁与近处观察适配 |
| proactive-messages.js | 聊天拥有的主动投递和来源验证 |
| world-memory.js | MemoryModule 与无界面宿主共用的世界候选接受规则 |
| TDocumentStore.java | 唯一 SQLite 文档、版本和写入租约 |
| TResidentEngine.java / TResidentWorker.java | QuickJS 原生 I/O 宿主及 WorkManager 有限唤醒 |
| TSecrets.java / TMemoryEngine.java | 从旧插件收口的原凭据读取和共用 OB 锁 |
| build-resident.mjs | 仅构建纯规则；生成脚本留在忽略目录 |
| vendor/alicization-town-life、resident-runtime-sources.json、新增许可 | 原件、逐文件来源、依赖版本与许可证 |
| resident-life 测试与 ResidentLifeInstrumentation.java | 合成模型、恢复、隔离、未读、无 Activity Worker 验收 |
| RESIDENT_LIFE.md | 使用、架构、限制、逐文件复用与验证 |
