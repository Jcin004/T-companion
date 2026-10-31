# T- · 联系人式陪伴聊天

当前 Android 试用版为 0.20.1（[记忆来源基础](docs/MEMORY_SOURCE_FOUNDATION.md)），新增 [可编辑本体与分部件衣柜](docs/MODULAR_OUTFITS.md)，新增可保存、可继续编辑的方格衣服绘画台（见 [绘画台](docs/CLOTHING_WORKBENCH.md)），修正选帧后位置调整误改整组的问题（见 [逐帧位置](docs/SPRITE_FRAME_POSITION.md)），简化形象编辑并减少图片存档下的移动开销（见 [编辑与行走性能](docs/SPRITE_EDITOR_PERFORMANCE.md)），保留 [固定素体与大小/落地对照](docs/FIXED_SPRITE_REFERENCE.md)，人物形象采用人物列表、皮肤卡片与三个独立编辑分页（见 [人物衣橱](docs/CHARACTER_WARDROBE_UI.md)），整合直接更新清单、断点续传/暂停与跨页面进度（见 [更新渠道](docs/UPDATE_CHANNEL.md)），新增世界全局对话搜索与记忆联动删除、人物皮肤库、表情立绘与可配置方向/站立/交互图集；AI 只选择已允许的资源。使用与边界见 [世界记录与人物呈现](docs/WORLD_EXPRESSION_HISTORY.md)。见 [世界画面与对话](docs/WORLD_VISUAL_DIALOGUE.md)、[摇杆操作](docs/WORLD_JOYSTICK.md)、[居民生活](docs/RESIDENT_LIFE.md) 和 [内置记忆数据流与验证](docs/ANDROID_EMBEDDED_MEMORY.md)。桌面保留聊天、人设名册、设置、外观、运行日志、记忆和自我入口。Android 默认本机独立运行，不依赖 Windows 或 T- 应用服务器；共同后端是另一种可选数据源，没有自动同步。

开始开发先读 [当前架构与数据流](docs/CURRENT_ARCHITECTURE.md)、[术语](GLOSSARY.md)、[维护规范](CONTRIBUTING.md) 和 [AGENTS.md](AGENTS.md)。公开前结论与候选方案见 [公开审计](docs/PUBLICATION_AUDIT.md)。

当前功能：角色创建和编辑、头像、模型配置与连接测试、真实 SSE 流式聊天、发送/生成/失败状态、幂等重试、草稿、复制、未读提示、历史上滑加载、关键词搜索、按时区日历跳转、主题与字体、系统声音试听、数据备份与恢复。

文件职责与布局评价见 [文件地图](docs/FILE_MAP.md)；已有功能的保护与回归检查见 [功能基线](docs/FEATURE_BASELINE.md)。

## Windows 启动

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-lock.txt
.\scripts\start.ps1
```

打开 [本机聊天](http://127.0.0.1:8000/)。在“设置 → 默认模型连接”填写 OpenAI 兼容 Chat Completions 服务地址、密钥和模型名，保存并测试，再到名册选择角色聊天。测试连接会产生一次很短的真实请求。

本机模式：Android 使用 SQLite、Keystore 加密密钥和原生 HTTPS 流；网页使用 IndexedDB，密钥保存于 localStorage（同源脚本可读，保护弱于 Keystore）。密钥不回显或导出。仅支持 OpenAI Chat Completions 文字 SSE 协议。浏览器直连需要服务商允许跨域，Android 原生请求不受 CORS 限制。

可选后端模式：`.env` 中的 `OPENAI_API_KEY`、`MODEL_NAME` 仅在新后端数据库初始化时作为种子；后续以该后端设置为准。部署附加指令仍使用 `ADDITIONAL_SYSTEM_INSTRUCTIONS`。

## Android 试用

网页资源内置 APK。打开桌面 → 人设名册创建角色 → 设置配置模型 API 并测试 → 发起聊天。无需填写共同后端地址或口令。包名 `io.jcin.tcompanion`，版本 `0.20.1-trial`，versionCode `32`，沿用旧版试用签名，覆盖安装保留本机数据。不要卸载旧版。

架构、构建与数据迁移见 [本机客户端说明](docs/LOCAL-ANDROID.md)，当前记忆功能及验收见 [0.6.0 说明](docs/MEMORY-0.6.md)；早期独立聊天验收见 [0.3.0 交付记录](docs/DELIVERY_LOCAL.md)。旧版后端式 APK 说明保留作历史资料。

```powershell
npm ci
npm run android:sync
# JDK 21 + Android SDK 35
.\android\gradlew.bat -p android assembleDebug --no-daemon
```

## 身份与记录

Canon 描述角色原始身份和事实，Persona 描述稳定人格。程序的 `BASE_RUNTIME_INVARIANTS` 始终放在身份之前，聊天和模型输出不能改写名册设定。未知事实保持 `UNSPECIFIED` 或空值。后端初始 YAML 只作数据库种子；本机角色在名册创建或明确导入备份，后续统一经名册编辑。

每个角色有独立身份与记录，发起聊天复用其联系人。本机网页、APK、可选后端的数据各自独立，不自动同步。旧数据通过备份 JSON 明确导入；不静默上传、合并或覆盖。本机上下文由可设置条数的已完成历史与独立开关的来源记忆召回组成。共同后端仍仅支持近期历史。最小世界与有限居民生活见上述说明；完整认知成长和桌面小人尚未实现。

数据和状态协议见 [聊天实现说明](docs/CHAT_MVP.md)。`docs/PHASE_1_SPEC.md` 等早期文档是历史阶段材料；本分支的当前实现以本 README 和聊天实现说明为准。参考仓库和本机工具放在忽略目录中，不参与应用构建或源码分发。

当前优化与复用说明见 [0.6.1 说明](docs/OPTIMIZATION-0.6.1.md)。本轮导入 float 包装解析、Serein BM25 评分和 jsonrepair；0.7.0 接入公开试用更新渠道；首次从关闭在线更新的旧版升级，需要先手动覆盖安装一次。

## 记忆与自我

桌面 → 记忆：人工保存或模型整理，逐条保留可跳转的来源原话；可编辑、停用、删除。召回按人物隔离，关联人物不会自动获得记忆。聊天记录 → 日历：总结卡片可预览、编辑、按当天原话重写、删除，并查看最近十个旧版本。桌面 → 自我：从名册分析核心标签，支持手动编辑，重新分析会保留人工标签。当前自我标签用于校对解读，聊天身份仍来自名册。

记忆设置可选整理模型连接、召回条数与字符预算，以及自动整理的消息间隔。自动整理默认关闭；模型整理、每日总结、自我分析均会额外调用模型。手工记忆和已有记忆的 BM25 关键词召回不产生额外模型调用。当前不含向量检索或完整图谱。原文历史为 0 不会关闭记忆召回。使用与验收详见 [记忆与自我说明](docs/MEMORY-0.6.md)。

源码分支新增手动记忆关联与核心标签依据：从记忆卡片的“查看关联”或自我标签的“关联记忆”进入，可查看方向、编辑、删除并回溯原话。0.7.0 试用版包含这些功能。详见 [记忆关联第一版](docs/MEMORY-LINKS.md)。

## 验证

```powershell
.\.venv\Scripts\python.exe -m pytest -q -W error
npm test
```

测试默认使用隔离数据库和模拟模型，不调用付费服务。浏览器测试启动方法见聊天实现说明。

## 许可和复用

本分支应用代码采用 AGPL-3.0-only，详见 [LICENSE](LICENSE)。float 中已核对的独立 SSE 解析模块有保留的来源和修改标记。Capacitor 保持 MIT 许可，其他组件保留各自许可。用户身份、头像、消息与凭据不因进入应用而转移权利。

[第三方署名与逐项复用审查](THIRD_PARTY_NOTICES.md)记录具体提交、文件、许可证、README 冲突和素材排除项。设置中可读取许可与源码获取方式；分发 APK 时须附带匹配源码包。

## Android 下载与覆盖更新

公开试用下载：[T-companion-updates Releases](https://github.com/Jcin004/T-companion-updates/releases)。安装前导出备份，直接覆盖旧版，不要卸载。0.7.0 起在 Android 应用“设置 → 关于与更新”检查后续版本；浏览器仅提供下载渠道说明。发布附件包含匹配源码与许可。

## 最小像素世界 0.11.0

桌面“世界”可进入暖木小屋，从现有名册绑定两位居民，点地板移动、点人物场景对话、点家具交互或推进一步。世界状态与知情事件保存在本机，Android 不需要电脑常开。事件可显式保存为知情人物的记忆，并由既有内置 OB 召回及回溯来源；线上聊天不默认面对面。详见 [最小世界说明](docs/MINIMAL_PIXEL_WORLD.md)。

## 居民生活 0.12.0

世界页“居民生活”可启用有限自主活动、经历整理和主动分享，配置安静时段与请求额度。角色的主动消息进入原聊天列表，并可追溯同一世界事件。Android 可另外启用 WorkManager 间歇后台，在无界面时运行同一套世界规则；系统会延迟任务，强制停止/关机期间不运行。默认关闭，模型决策、整理和分享会请求现有预设。使用和验收见 [居民生活](docs/RESIDENT_LIFE.md)。

人物图片管理：桌面「档案」按人物上传、命名图片并设为表情，世界及衣橱共同使用。见 [人物图片档案](docs/CHARACTER_ARCHIVE.md)。自动生图尚未接入。

服装工作室的后续安排见 [实施流程与开源复用调查](docs/OUTFIT_WORKSHOP_PLAN.md)：大小与脚底校准已完成，四方向素体已有试作；整格绘画与可恢复草稿首版已验收，服装自动适配动作和分部件组合穿搭为后续阶段。
