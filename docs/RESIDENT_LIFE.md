# 居民自主经历、分享与 Android 间歇后台

本阶段从干净的 `feat/minimal-pixel-world@ec7a2af` 创建 `feat/resident-life-sharing`，保留 0.11.0 的地图、人物绑定、场景会话、事件来源与内置 OB。新版为 0.12.0-trial，包名和签名沿用原试用包。

## 数据所有者和执行路径

| 数据/职责 | 产生、校验与保存入口 |
|---|---|
| 世界位置、实际行动、居民对话 | `world-core` 校验地图/距离/路径；居民候选经 `resident-life-core` 接受才追加不可变 world_event |
| 人物身份 | 只读现有名册 `rosterSource`；不导入参考项目人物，不更新 Canon/Persona |
| 当前计划 | 每位居民自己的短文字计划，模型提出、长度与行动者校验后保存到 `world.life.plans` |
| 模型决策与有限批次 | `resident-life-core` 纯状态机；JS 前台编排 `ResidentLifeService`，Android 前台和 Worker 共用 `TResidentEngine` |
| 个人认知与长期记忆 | 观察/收到的原文属于世界；主观归纳属于现有记忆卡片；`world-memory` 是 MemoryModule 共用的候选接受规则 |
| 主动消息与未读 | `proactive-messages` 属于聊天领域，按稳定 delivery_id 投递角色消息，原始事件不复制成用户消息，也不创建问答轮次 |
| 调度 | Android WorkManager 管间歇唤起、网络与低电量约束；规则与额度由共享状态机管理，不由页面定时器模拟后台 |

Android 无界面执行方式：esbuild 将 `resident-headless.js` 及现有纯领域依赖打包为 APK 内 `resident/rules.js`；QuickJS Java 执行明确的 begin/next/prompt/reserve/response/apply 操作。模型输出只作为 JSON 数据解析，不作为脚本执行。Worker 不创建 Activity、WebView、DOM 或 Canvas。前台“让居民生活一批”在 Android 也调用同一原生宿主和同一 JS 规则包；浏览器使用相同规则的异步 I/O 适配。Android 仍支持 API 24 以上的原有架构，不引入 Node 服务器、云服务或另一套人物/记忆库。

SQLite `documents` 仍是唯一业务底账。新增 `document_revision` 和 `document_lease` 是写入协调元数据，不是第二个世界数据库。`TDocumentStore` 统一管理版本 CAS 与跨宿主写入租约；前台每个事务先取得租约、重读最新数据，再校验/同步 OB/保存。居民批次持有租约直到有限执行结束，防止前后台修改覆盖。界面读查询重读 SQLite；正在生成的普通聊天阻止居民批次开始，居民执行时普通模型请求在发送前被拒绝。进程重启清理本进程遗留租约；业务任务状态保留，不能借清锁重发旧付费请求。

`TMemoryEngine` 是前后台共用的 OB 执行锁和缓存目录。个人记忆仍存原 `memory.events`，候选执行原 `eventValue/validateEvidence`；Android 召回使用真实内置 OB，随后按人物、证据和原记忆字符预算筛选。OB Markdown/索引只是可重建派生缓存。`TSecrets` 从原 Keystore/SharedPreferences 格式读取原模型凭据，没有新的配置或密钥存储。

## 居民行动和彼此交流

每批轮换两位居民，各自用身份、近处观察、自己已知事件和合法记忆请求候选。动作仅 move、interact、say、wait；actor_id 必须等于本轮人物。移动仍调用原 A* 和碰撞；交互必须已经走近。模型描述“已经做了”不会改变世界。当前计划与真实行动分开保存；无效动作不产生事件。

say 明确接收者，限附近三格，保存 speaker_id、recipient_id、conversation_id、turn、reply_to，以及实际听到的两位人物。接收者用自己的身份、记忆和收到的发言另发一次模型请求，不能由一个模型代写双方。回复轮只允许回答或结束。居民对话原话作为“某人说”的世界事件保存，不把观点当作客观行动。关联、提及、世界页面查看权限都不授予人物知情资格，也不产生双向关系。

用户完成的场景对话仍产生原事件；后续居民决策能读到自己收到的用户发言，因此用户可以影响下一步计划。线上私聊继续不默认面对面，不读取当前房间视觉。

## 经历整理和分享

“自动整理已知经历”有独立开关、事件数量阈值与来源字符预算。每次最多三条卡片，只能引用这次提供的 world_event 原文，并保留主体与不确定性。优先处理近期经历；保存成功才推进该人物已整理来源清单。已有人工编辑、暂停、删除、关联和来源查看继续使用原记忆界面。自动整理不覆盖人工卡片或人物身份；关闭自动整理不会删除已保存记忆。

分享有开关、每人间隔、安静时段、单批和每日请求预算。模型可以返回不分享。分享必须指向该人物已知、该轮提供的事件并附连续原文；正文将来源引文和“我的想法”分开。程序不能语义证明任意主观文字，因此其正文始终是人物陈述，世界事实以事件记录为准。

投递在一次事务中先保存，再展示到既有聊天列表。消息是原生 assistant 消息，带 origin=world_share、source_event_id、source_owner_id、delivery_id；没有伪造用户消息，也没有虚构请求轮次。相同人物对同一事件的相同投递标识只保存一次。未读游标保存在会话中；点击后可继续原线上聊天，也可查看来源或进入世界走近不同人物询问。没有分享的事件保留在世界列表，其他人物仍只知道有依据的经历。

## 恢复、预算与取消

任务日志 `world.life.jobs` 状态：prepared → requesting → responded → applied。发送前先保存请求标识、上下文及额度预留；完整响应独立保存后才执行。应用中断后：

- prepared：尚未发送，可以继续；
- requesting/uncertain：无法确认服务商是否计费，停止自动重发，用户明确“跳过”后才继续下一任务；预留额度不退回；
- responded：候选已保存，恢复只重试校验/提交，不调用模型；
- applied：已完成，重复接受返回同一记录，不重复行动、分享或记忆。

模型服务没有普遍的跨进程计费幂等保证；本实现通过“不重发不确定请求”控制风险，不能承诺服务商必定零扣费。原生请求携带稳定 Idempotency-Key，但不依赖服务商支持它。失败/取消/不完整输出不变成世界事实。已成功的早期行动保留，批次记录 last_success_job/at。单批行动、居民对话轮次、模型请求、每日请求均有上限；额度包括行动、记忆与分享请求。当前普通聊天自己的用户发起请求不计入居民额度。

暂停会禁用居民生活并取消当前请求与周期工作。设置启用后台时注册唯一周期任务，最短间隔 15 分钟；有网络且电量不低时才具备执行资格。安静时段使用应用设置时区；到时仍安静就跳过，不事后补演过去。记录 actual_executed_at/started_at 和上次实际尝试状态；界面不把前台运行标记成后台。

WorkManager 的周期不是精确定时：系统休眠、配额和厂商策略可以延后；强制停止和关机期间不承诺继续执行。应用重新打开不会补算一段并冒充过去发生。共同后端和浏览器关闭后的后台执行不属于本阶段支持范围。

## 逐文件复用评估

本轮检查了用户现有 GitHub 仓库列表，以及 `config/world-reference-sources.json`、既有复用记录和本机 Alicization Town 固定源码。优先沿用 T 已内置的 OB、Serein/float 小模块及已有名册/模型预设；没有读取或复制用户的私人备份仓库内容。

| Alicization Town 文件 | 固定版本及本轮处理 |
|---|---|
| `server/src/engine/action-lock.js` | `1a33ba65`，blob `8c5e3277f79a56d61d9f3f9838cac00fa253f1e5`，ceresOPA；复用 Promise 互斥算法到 `resident-lock.js`，仅改 ESM 导出 |
| `server/src/ai/scheduler/ai-scheduler.js` | 同提交，blob `71a8f17334f3593e5b3a4a165feda47032873360`，CeresOPA；提取 gatherContext 的纯距离投影到 `resident-perception.js`，输入改为名册 ID/位置，保留其他 NPC、范围改为三格，去除网络/独立记忆读取 |
| 同文件 tick/scheduleNextTick/executeDecision | 已逐段核对：原 setTimeout/heartbeat 需要常驻 Node；原内存 currentGoal/错误回退不能保证 Android 进程终止后的记账。保留“观察→决策→校验行动”的分工，在现有 SQLite 中实现可恢复任务状态，Android 用 WorkManager 唤起 |
| `server/src/ai/prompts/prompt-templates.js` | blob `2ddf2634e4be90cee5f2f56a01c4887c7dae709e`；核对 ACTION_TOOLS（chat/move/interact/observe/setGoal）。T 使用受限 JSON 候选映射，不导入默认性格与人物提示词，不带入上游多人全量上下文 |
| `server/src/ai/memory/memory-store.js` | 依赖 Node sqlite 并自建 npc_memories/关系/目标；T 已有 OB 和来源卡片，故用其接口分工作参考，不引入第二份个人记忆 |
| `server/src/plugins/ai-npc-plugin.js`、base-npc/base-interactions | 配置发现、在线玩家生命周期和上游插件上下文耦合；Android 读取现有名册，使用原世界命令与验证，不加载 Node 插件或公共身份 |

原版文件、许可、作者、blob、修改与依赖在 `frontend/vendor/alicization-town-life/provenance.json`。上游根 AGPL 与 README/package MIT 元数据冲突继续按根 AGPL v3 授权处理。QuickJS 0.9.2、WorkManager 2.10.1、esbuild 0.25.12 的版本、许可和指纹见 `config/resident-runtime-sources.json` 与 `THIRD_PARTY_NOTICES.md`。没有引入完整欲望、经济、自主人格成长、社会关系或第二套在线世界。

## 体验方法与验收入口

安装原签名新版 → 桌面世界 → 绑定两位已有名册人物 → 展开“居民生活” → 配置模型及额度、关闭不需要的安静时段 → 启用并保存 → 点“让居民生活一批”。居民可能分享，也可能不分享；到聊天列表查看未读消息，打开来源，再进入世界走近人物询问。需要后台时另勾选 Android 间歇后台，保存后退出到系统桌面等待系统调度；暂停按钮会取消。

自动化仅合成数据与模拟模型：`tests/resident-life.test.mjs`、`tests/resident-life-browser.mjs`、`ResidentLifeInstrumentation.java`。原世界触屏、原记忆、关系和模型切换沿用原回归。Android 显示验收必须等 Canvas 实际绘制（data-drawn 与不透明像素），并保存 Android screencap 原生截图，不能只看 DOM/点击成功。旧空白证据已用原生截图复核：房间可以实际显示；无需改变像素美术。
