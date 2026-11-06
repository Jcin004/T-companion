# SullyOS 无界面世界模块接入实验

日期：2026-11-06。基线：0.24 工作区 `329fe62`。实验分支：`experiment/sully-headless-world`。本实验不是产品试用版，不发布 APK 更新。

## 结论

通过：保留原样的 SullyOS `threads.ts` 可以编译后在 Android QuickJS 无界面宿主中执行，用生产 TDocumentStore 的 SQLite/CAS/租约保存，再由只读 WebView 界面读到同一结果。可以继续成组模块适配验证，不需要先另写人物间通信算法。

该结果不等于整套 SullyOS 产品底座已可迁入。本次没有运行 `runWorldEpisode`、真实模型、完整记忆数据库、人物多地点生活、自然周期后台调度或实体手机。SullyOS 的页面调度和家园模型演绎仍需进一步分离。

## 复用与所有者

| 实际保留的源码 | 固定来源 | 用途 |
|---|---|---|
| SullyOS `utils/worldHome/threads.ts` | `8035795e443579ead0f28d1dfe9d5a87ff0b232e`，NMJ | 私信线程建立、追加、去重、按人物读取、格式化 |
| A-Life `core/Clock.ts` | `b2328099cd8756d4c775255cdebbdf7fd132665d`，Eugene Rusakov | 规则时钟、小时回调、序列化和恢复 |
| A-Life `ai/GOAPPlanner.ts`、`GOAPAction.ts`、`WorldState.ts` | 同上 | 按前置条件和效果规划“走到书桌 → 读书”；不可达目标返回空计划 |
| TDocumentStore | 本项目现有实现，未修改 | 真正的 SQLite 原子保存、版本 CAS、写入租约 |
| TResidentEngine / build-resident 模式 | 本项目既有 QuickJS 宿主模式 | 复用宿主组织方式和构建参数；隔离实验单独实例化 QuickJS，不启动原居民模型循环 |
| embedded-ob-android 的 CDP 传输模式 | 本项目现有验收链路 | 读取真实 Android WebView、截图、重启核对；未假定页面数据等于已落库 |

逐文件原仓库、提交、Git blob、SHA-256、许可、作者及依赖见 `config/world-probe-sources.json`。上游文件位于 `frontend/vendor/sullyos-world/` 与 `frontend/vendor/alife-core/`，逐字节 Git blob 校验通过；没有修改供应商算法。SullyOS 自身类型仅供 TypeScript 使用，打包时擦除；不搬入其全局数据库。A-Life 的实体类型为 type-only；没有引入 Node 或游戏渲染引擎。

SullyOS 原许可随文件保留；沿用 THIRD_PARTY_NOTICES 中 2026-11-01 记录的用户报告的公开二改授权，不把原许可改标为 MIT/AGPL。A-Life 为 MIT。两套源码的适配分别保存在供应商目录外。

## 数据流与隔离

合成固定输入（A→B 私信） → QuickJS 执行 SullyOS 原 `applyBeatToThreads` → `dmThreadsOf/formatThreadForPrompt` 为 B 读取 → TDocumentStore 保存实验快照及回执 → 新宿主重新读 SQLite → 只读实验 Activity 显示。

- Android 原生入口仅在 `src/debug`：WorldProbeEngine、WorldProbeWorker、WorldProbeActivity。没有修改 MainActivity、正式 LocalService、人物身份、记忆与衣柜业务。
- 实验 SQLite 位于应用私有 `files/world-probe-db/t-local.db`，通过 ContextWrapper 使用同一个 TDocumentStore 实现。正式 `databases/t-local.db` 未创建。实验没有读真实密钥、聊天或主记忆。
- 界面只暴露读取接口，禁止 WebView 网络加载；重新读取不生成、不推进、不写入。
- 任务标识、输入指纹和回执随世界同事务保存。重复任务返回既有快照；相同标识不同内容被拒绝。保存失败不发布新回执。
- 消息 ID/时间由未修改的上游算法生成，第一次落库后稳定保留；重试不重新调用上游追加路径。
- 两位人物与台词均为测试合成数据。没有模型、付费网络或产品主记忆写入。

## A-Life 发现与补算适配

原 Clock 单次 `update(48h)` 时，内部按日内小时差计算回调，小时值相同导致 0 次小时回调，预期为 48。保留原码，适配模块把经过时间按最多一小时分段送入原 `update`。

Android QuickJS 和 Node 都验证了 23:00 起普通半小时、跨午夜两小时、跨 49 小时每一项小时/日号、17 小时存档后恢复推进到 49 小时，以及同一绝对经过时间重复补算不变。输入范围限制为实验用七日；这不是已经完成的无限离线补算策略。

GOAP 在同一个 QuickJS 引擎运行。行动描述、当前状态、目标和计划 ID 可序列化；恢复后重新建立原规划器，结果一致。另验证不可达目标，未接入模型或固定人物性格。

## 验收结果

| 验收 | 结果 |
|---|---|
| Node 全套 | 189 通过，含新增 3 项集成/来源测试 |
| Python 全套 | 103 通过，`-W error` |
| Android 构建 | JDK 21；`:app:assembleDebug :app:assembleDebugAndroidTest` 通过 |
| 实际无界面任务 | Android 11/API 30，独立新模拟器；一次性 WorkManager Worker；Activity 创建计数 0 |
| 原线程代码 | 林向雨发私信，雨再回复；线程共 2 条，世界版本 2 |
| 持久化 | SQLite 存储版本 2；执行重读、界面对象和重启后对象深比较一致 |
| 重复执行 | 再次执行同一 Worker 请求，快照和存储版本完全不变 |
| 旧版本 | 入口旧版本请求拒绝；直接调用生产 store 的旧 revision 保存亦拒绝 |
| 保存失败 | SQLite BEFORE INSERT 触发器实际 RAISE(ABORT)；任务报错，原快照与回执完整保留 |
| 规则 | 普通、跨午夜、多日逐小时、恢复、重复补算、GOAP、GOAP 恢复、不可达目标全部通过 |
| UI 兼容 | API 30 的旧版 WebView；两条私信可见；读取按钮与重启后均不变 |
| 数据隔离 | 正式数据库未创建；零模型请求 |

证据由 `tests/world-probe-android.mjs` 生成：`artifacts/world-probe/evidence.json`、`instrumentation.txt`、`world-probe-first.png`、`world-probe-restart.png`。截图已人工查看。首轮 UI 检查发现旧 WebView 不支持 replaceChildren，改用 textContent 清空后重建并重新完成整个隔离验收。

## 复现

只在新的专用模拟器运行，SDK/Java 路径由本机配置提供，不用真实设备或已有数据模拟器。

1. `node scripts/build-world-probe.mjs`
2. 在 android 目录用 JDK 21：`gradlew :app:assembleDebug :app:assembleDebugAndroidTest -PupdateTestRunner=io.jcin.tcompanion.WorldProbeInstrumentation --offline`
3. 安装 app-debug.apk 与 app-debug-androidTest.apk 到专用模拟器。
4. `node tests/world-probe-android.mjs <adb路径> <emulator序列号>`
5. `npm test`；`.venv/Scripts/python.exe -m pytest -q -W error`。

测试要求隔离实验 DB 初始为空，不自动清空任何数据。原生验收成功后如仅需重新采集界面，可设置 `WORLD_PROBE_UI_ONLY=1`，它要求已有本次通过的 instrumentation 日志及设备证据，不代替原生验收。

构建务必用 `:app:` 限定任务；根目录不限定项目的 assembleDebugAndroidTest 会额外构建 Cordova 子项目自己的测试，并遇到其 Kotlin split-stdlib 冲突。本次没有为此修改产品依赖。

## 候选后续处置

- A-Life SDK：时钟/GOAP 已通过实际 QuickJS 兼容试验，继续评估日程、资源与行动执行。不能把该结果写成已经实现完整生活世界。
- 积温 `1c15a1f697816cd75e769f1df06278322293034a`：MIT，状态漂移/阈值触发候选。本次未导入；其默认围绕联系用户的策略及 Date.now 依赖需要适配世界时间，不能照搬人物动机。
- Alicization Town：沿用既有寻路、感知、锁与世界校验适配，不重复引入第二套人物/记忆。
- urbe-population：已核对 `package.json` 为 UNLICENSED，本次排除代码导入。

下一步值得验证的是 SullyOS 成组家园数据/生成流程和记忆接口接入，而非立即更换完整底座。手机规则补算路线已确认；完整世界的事件顺序、资源占用、长期存档容量和模型唤醒预算仍需在后续阶段落实。
