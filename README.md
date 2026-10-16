# T- · 联系人式陪伴聊天

当前应用基线为 0.6.1。小手机桌面提供聊天、人设名册、设置、外观、运行日志、记忆和自我入口。Android 默认本机独立聊天，不依赖 Windows 或 T- 应用服务器；共同后端是另一种可选数据源，没有自动同步。

开始开发先读 [当前架构与数据流](docs/CURRENT_ARCHITECTURE.md)、[术语](GLOSSARY.md)、[维护规范](CONTRIBUTING.md) 和 [AGENTS.md](AGENTS.md)。公开前结论与候选方案见 [公开审计](docs/PUBLICATION_AUDIT.md)。

当前功能：角色创建和编辑、头像、模型配置与连接测试、真实 SSE 流式聊天、发送/生成/失败状态、幂等重试、草稿、复制、未读提示、历史上滑加载、关键词搜索、按时区日历跳转、主题与字体、系统声音试听、数据备份与恢复。

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

网页资源内置 APK。打开桌面 → 人设名册创建角色 → 设置配置模型 API 并测试 → 发起聊天。无需填写共同后端地址或口令。包名 `io.jcin.tcompanion`，版本 `0.6.1-trial`，versionCode `8`，沿用旧版试用签名，覆盖安装保留本机数据。不要卸载旧版。

架构、构建与数据迁移见 [本机客户端说明](docs/LOCAL-ANDROID.md)，当前记忆功能及验收见 [0.6.0 说明](docs/MEMORY-0.6.md)；早期独立聊天验收见 [0.3.0 交付记录](docs/DELIVERY_LOCAL.md)。旧版后端式 APK 说明保留作历史资料。

```powershell
npm ci
npm run android:sync
# JDK 21 + Android SDK 35
.\android\gradlew.bat -p android assembleDebug --no-daemon
```

## 身份与记录

Canon 描述角色原始身份和事实，Persona 描述稳定人格。程序的 `BASE_RUNTIME_INVARIANTS` 始终放在身份之前，聊天和模型输出不能改写名册设定。未知事实保持 `UNSPECIFIED` 或空值。后端初始 YAML 只作数据库种子；本机角色在名册创建或明确导入备份，后续统一经名册编辑。

每个角色有独立身份与记录，发起聊天复用其联系人。本机网页、APK、可选后端的数据各自独立，不自动同步。旧数据通过备份 JSON 明确导入；不静默上传、合并或覆盖。本机上下文由可设置条数的已完成历史与独立开关的来源记忆召回组成。共同后端仍仅支持近期历史，本轮不提供远程记忆或自动同步。自主生活、完整认知成长、世界和桌面小人尚未实现。

数据和状态协议见 [聊天实现说明](docs/CHAT_MVP.md)。`docs/PHASE_1_SPEC.md` 等早期文档是历史阶段材料；本分支的当前实现以本 README 和聊天实现说明为准。参考仓库和本机工具放在忽略目录中，不参与应用构建或源码分发。

当前优化与复用说明见 [0.6.1 说明](docs/OPTIMIZATION-0.6.1.md)。本轮导入 float 包装解析、Serein BM25 评分和 jsonrepair；在线更新渠道未发布，界面明确显示私有手动更新。

## 记忆与自我

桌面 → 记忆：人工保存或模型整理，逐条保留可跳转的来源原话；可编辑、停用、删除。召回按人物隔离，关联人物不会自动获得记忆。聊天记录 → 日历：总结卡片可预览、编辑、按当天原话重写、删除，并查看最近十个旧版本。桌面 → 自我：从名册分析核心标签，支持手动编辑，重新分析会保留人工标签。当前自我标签用于校对解读，聊天身份仍来自名册。

记忆设置可选整理模型连接、召回条数与字符预算，以及自动整理的消息间隔。自动整理默认关闭；模型整理、每日总结、自我分析均会额外调用模型。手工记忆和已有记忆的 BM25 关键词召回不产生额外模型调用。当前不含向量检索或完整图谱。原文历史为 0 不会关闭记忆召回。使用与验收详见 [记忆与自我说明](docs/MEMORY-0.6.md)。

## 验证

```powershell
.\.venv\Scripts\python.exe -m pytest -q -W error
npm test
```

测试默认使用隔离数据库和模拟模型，不调用付费服务。浏览器测试启动方法见聊天实现说明。

## 许可和复用

本分支应用代码采用 AGPL-3.0-only，详见 [LICENSE](LICENSE)。float 中已核对的独立 SSE 解析模块有保留的来源和修改标记。Capacitor 保持 MIT 许可，其他组件保留各自许可。用户身份、头像、消息与凭据不因进入应用而转移权利。

[第三方署名与逐项复用审查](THIRD_PARTY_NOTICES.md)记录具体提交、文件、许可证、README 冲突和素材排除项。设置中可读取许可与源码获取方式；分发 APK 时须附带匹配源码包。
