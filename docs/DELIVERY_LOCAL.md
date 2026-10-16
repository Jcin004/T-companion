# 0.3.0 本机聊天交付记录

日期：2026-10-15，Asia/Shanghai。分支 `feat/chat-mvp`，PR <https://github.com/Jcin004/T-/pull/1>。原 `T-` 工作区的 `phase-1.5/character-foundation` 保持不变。

## 完成

- 小手机桌面、原创 CSS 壁纸、时钟、三个应用图标与 Dock；聊天、名册、设置可进入并返回。独立标题栏与系统返回层级，无持续全局 Tab。桌面切换保留草稿、滚动位置与当前生成。
- 默认本机业务：Android SQLite / Keystore / 原生 HTTPS SSE；浏览器 IndexedDB / fetch，共用身份、上下文、记录、重试与历史模块。共同后端移到高级设置，默认不启用，不自动上传或同步。
- 模型协议选择与连接测试；当前仅支持 OpenAI Chat Completions 文字流。错误、停止、部分回复与进程中断状态；只将完整轮次放入后续上下文。消息先落盘，重试复用原用户与回复 ID。
- 连续历史、搜索、日历、明确时区、备份恢复、头像和草稿；兼容旧后端 version 1 JSON 的明确导入，密钥不随备份。
- 关于与更新显示 0.3.0，保持包名和签名，versionCode 由 2 增至 3。内置网页资源，未发布 Release。

## 验证范围

- Python `pytest -q -W error`：85 passed。
- Node：6 项通过，覆盖持久化先于请求、失败/中断/取消、幂等重试、角色隔离、身份元数据排除、密钥排除、备份校验、600 条同时间戳历史与日历。
- Edge 实际操作：桌面进入/返回，生成中切换，草稿、滚动和刷新保留；直接连接独立模型 fixture；授权失败和重试无重复；取消；备份下载与恢复；角色隔离；600 条历史分批加载，视口锚点误差不超过 2px，搜索与日期跳转后可继续浏览。
- Pixel 5 模拟器，Android 11 / API 30 / WebView 83：安装旧版 0.2.0 → 新版 0.3.0 覆盖安装成功，应用私有升级标记保留。新版设置和角色由真实 UI 创建，模型连接测试通过。
- 停止电脑 T- HTTP 8000 / HTTPS 8443 后，仅保留独立 HTTPS 模型 fixture：原生直连聊天成功，先看到第一段，再收到第二段；SQLite 保存完整轮次。强制停止后重开，角色、消息、设置保留。
- 原生 401 提示可理解，重试后仍为同一组用户/助手记录。生成只收到第一段时强制停止进程，重开后原轮次变为 interrupted，保留部分内容而非标为完成。
- 原生密钥设置：私有 SharedPreferences 仅见 AES-GCM 密文与 IV，设置不回显；关闭 Capacitor bridge payload logging 后检查 logcat，测试密钥未出现。
- APK v1/v2/v3 签名验证与 4-byte/page zipalign 检查通过；试用签名私钥及密码保持本地忽略目录。

模型服务为隔离测试替身，没有调用付费 API。Android 使用 adb reverse 连接模型 fixture，仅是测试网络路径，不是 T- 后端；实际手机填写服务商 HTTPS URL。未连接物理手机，尚未完成真实密钥/服务商与各厂商系统的实测。

## 产物与操作

- `artifacts/T-companion-0.3.0-trial.apk`
- `artifacts/T-companion-0.3.0-source.zip`，对应源码和构建说明，分发 APK 时一起提供。
- `artifacts/T-companion-0.3.0-tryout.zip`：APK、源码、许可、安装说明、校验值；不含个人数据、模型密钥或签名私钥。
- 预览：<http://127.0.0.1:8012/>；桌面截图 `artifacts/desktop-0.3.png`，聊天截图 `artifacts/chat-local-0.3.png`；Android 验证截图也保存在忽略的 artifacts 目录。

覆盖安装后：桌面 → 名册创建/选择角色 → 设置填写服务商地址、模型名、密钥，保存并测试 → 名册发起聊天。无需共同后端。

现有电脑数据库迁移前使用 SQLite backup API 保存到 `data/backups/before-local-20261015-213537.db`。原库、签名、后端均保留。迁移操作和复用来源详见 [LOCAL-ANDROID.md](LOCAL-ANDROID.md)。

## 未完成

应用内 Releases 下载/校验/系统安装、通知推送、多设备同步尚未实现。声音使用已有系统 TTS，中文语音依赖设备安装的引擎。首版无消息附件。本地库目前是事务文档快照，已验证 600 条记录；更大容量仍需要专项性能验证。
