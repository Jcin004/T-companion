# 最小像素世界 0.11.0

本阶段基线为 `research/pixel-world-references@a69002c`，包含 `feat/android-embedded-ob@0b8c7ff`；开始时无未提交修改。功能分支 `feat/minimal-pixel-world`，不合并 main。Android 与本机网页支持本轮功能，共同后端暂不提供世界 API。

## 数据与接口

`WorldModule` 负责命令和读取，`world-core` 负责状态、不可变事件与实际观察记录。`world-map` 为原创数据地图，`world-renderer` 只绘制，`world-ui` 只调用业务接口。世界不持有模型连接、人物资料或记忆卡片。

世界保存人物名册 ID；首次进入从现有名册选两位居民，不创建额外人设。`data.world` 是业务文档 version 2 的新增可选字段：旧数据初始化为空世界，备份恢复校验世界、位置、事件和引用。Android 继续由 `LocalService.transact` → `NativePersistence` → TLocal SQLite 原子保存同一业务文档，浏览器使用既有 IndexedDB。没有另一个世界数据库或 Node 常驻服务。

| 接口 | 所有者与用途 |
|---|---|
| `GET /world` | 世界快照、房间与居民名册只读投影 |
| `POST /world/setup` | 初次绑定两个已有名册 ID |
| `POST /world/commands` | move / interact / advance；显式用户操作，稳定 request_id，同事务保存位置、步数、事件、观察记录 |
| `POST /world/dialogue` | 创建/复用独立场景会话，复用聊天编排与模型预设 |
| `GET /world/sources?owner=…` | 该人物已知事件来源，最近 300 条供选择器使用 |
| `GET /world/sources/{id}?owner=…` | 按 ID 读取完整事件；不受选择器窗口限制，核对实际知情依据 |
| 原 `/memories` 与 `/contacts/{id}/context-preview` | 记忆管理、真实 OB/词法召回、预算及上下文预览继续使用原接口 |

用户控制自己的小人，也可显式选择居民移动。位置以网格保存，A* 四方向寻路避开墙、家具和其他人物；画面在已保存路径上做短动画。家具操作会先走近，再执行交互，每步都有自己的事件。没有后台时间推进、欲望、自主移动或模型世界命令。应用退出后暂停。

事件保存稳定 ID、请求绑定、UTC 时间、世界步数、地点/坐标、参与者、原文、命令或完成对话来源，以及观察者/听到者的 ID、方式、当时位置。移动观察按路径逐格计算，其他操作按执行位置计算，同房间曼哈顿距离 3 格以内可见；本轮无隔墙地图、传闻传播或复杂视线遮挡。事件没有编辑 API。操作保存失败不发布状态；原请求重试返回同一事件，换内容复用 ID 被拒绝。`dialogue_` 是对话事件的保留请求前缀。

## 场景对话与线上聊天

场景会话 `mode=world, room_id=warm-room`，与同人物线上会话分开保存历史和草稿。已有线上联系人仍在聊天 App 中；来源跳转进入场景会话时标题标明“场景”。场景对话窗口提供姓名、已有名册图片（无图片用姓名字形）、文本框、流式回复、停止、重试、旧记录加载、上下文条数和预览；模型连接仍使用原 API 预设和悬浮切换入口。

聊天仍由 `LocalService.stream` 负责。首次接受场景轮次时冻结临时场景快照，重试保留该快照；预览读取当前场景。仅提供地点、近处人物、已确认房间事实和灯光；未提供事件全集或其他人的记忆。世界操作与生成互斥。只有回复完整持久化后才在同一事务追加对话事件，保存原消息 ID；失败、取消和未完成回复不追加事件。模型说的内容只记为“某人说”，不执行其旁白或改写世界。

当前场景对话仅交谈双方听到；同房间旁人不自动旁听。线上私聊没有临时房间信息，不默认共处，不观察用户未提供的动作。两种会话可按同一人物的合法长期记忆召回过去经历；记得过去的房间不表示现在还在房间里。

## 记忆来源

旧证据 `{message_id, quote}` 原格式不变；新增 `{source_type:'world_event', event_id, quote}`。`memory-evidence` 通过世界只读来源接口核对知情范围与逐字引文。参与关联不会扩大知情范围，也不生成反向人物关系。

世界事件是事实/陈述原文；人物的归纳与解释保存在既有 `memory.events` 卡片，`kind=experience/statement/interpretation` 可校正，不自动覆盖 Canon/Persona。当前场景快照不自动成为长期记忆。事件列表的“保存为某人的经历”是显式接受动作；也可在记忆 App 手动选择已知事件、编辑引文和内容。卡片、旧版、关联和关联候选支持世界来源追溯，旧聊天来源仍能跳转。

卡片保存继续由 MemoryModule 校验与统一事务处理；Android 使用原内置 OB 排序、原记忆网单跳策略与总预算，不调用外部记忆服务。SQLite 保存的卡片和世界事件是底账，OB 缓存可重建。暂停/删除卡片影响后续召回，不删除事件原文。仅有事件而未保存卡片时，本轮不将它自动纳入长期召回。

## 逐文件复用结论

| 来源 | 核对与处理 |
|---|---|
| Alicization Town `server/src/engine/pathfinding.js` | 固定 `1a33ba65d0af2134b369b1eb4eb68f45d2c817c4`。完整保留供应商文件和根许可；`world-pathfinding.js` 仅加来源注释、CommonJS → ESM 导出。纯算法可在 WebView 运行，无 Node 依赖。作者、blob、哈希和修改清单在 `frontend/vendor/alicization-town/provenance.json` |
| `server/web/js/game.js` 地图绘制/读取 | Canvas 2D，但同时依赖 Socket.IO、网络身份、侧栏和上游地图/素材。未整体导入；本轮原创小地图的数据、Canvas 绘制与输入接口可离线运行，无上游素材许可负担 |
| `server/src/engine/world-engine.js` 移动/碰撞/区域交互/命令 | 已核对 `collisionMap`、`findPath`、`interact`；依赖 fs/crypto、Node 存储和 EventEmitter，以及上游互动表/插件。保留网格寻路复用，在 T 的事务内实现移动/交互和持久观察，不引入其在线身份与模型/记忆系统 |
| `server/src/engine/perception.js` 与插件机制 | 注意力缓冲不是持久来源；本轮使用持久观察记录和小型命令接口。暂不加载第三方插件，不添加泛化插件框架 |
| InternalBeyond `game/game_module.js` | 本轮实际读取 Fork 固定 `31c1bf410f2cc8b7a0c9d0eb0fd7c43eef500714`，blob `05c5d1c63c8048158b709aa3aa9f6cf0ac3532d9`，作者 Sui。1672×941 坐标、固定角色 sprite/portrait、WALK_POLY/OBSTACLES、INTERACTIONS、DOM 对话框及 localStorage/API 耦合。需要重写几何和应用桥接，纯 A* 更适合取自 Alicization Town。只参考地点点击、立绘/姓名/对话框分工，不复制代码或美术 |
| InternalBeyond 许可 | 实际读取 `LICENSES/LICENSE-CODE.md`：PolyForm Noncommercial 1.0.0；美术文档按参考清单 CC BY-NC-SA 4.0 权利范围。未作为 T 的 AGPL 代码或素材导入 |

房间、家具、小人、色板全部由 T 的 Canvas 绘制代码原创。私人截图只作视觉参考，继续留在忽略目录。没有导入 Mod DLL、API 声明、第三方人设、外部统计或在线世界地址。地图碰撞规则、持久观察和来源适配不能由上游在线缓冲直接承担，因而由本轮实现。

## 使用与验证

安装同包名原签名新版 APK → 名册准备两个人物 → 桌面“世界”→ 选择居民 → 点地板行走、点人物交谈或点地点交互 → 展开“世界经历与知情范围” → 显式保存某位知情者的经历 → 在记忆 App 查看事件来源或在该人物后续聊天中召回。

逻辑：`npm test`；`.venv/Scripts/python.exe -m pytest -q -W error`。触屏网页：`node tests/world-browser.mjs`（静态 dist 由 127.0.0.1:8014 提供，所有模型请求拦截模拟）。Android：`tests/world-android.mjs`，要求专用空 userdata 镜像，旧同签名 0.10.0 先安装；测试不清空现有安装，拒绝非空数据。使用真实 Python/OB/SQLite，模型传输模拟。测试证据与截图放本机忽略目录 artifacts。

下一阶段先扩充房间美术、可配置人物展示和事件到记忆的显式整理，再增加剧情空间与多人事件；生活状态、欲望和自主唤醒仍在像素世界之后。共同后端世界协议与多端同步另行实现。

### 本轮验收结果

95 项 Node 测试、97 项 Python 测试通过。手机尺寸浏览器实际触屏移动/交谈/交互、世界来源与记忆编辑、刷新持久化通过；旧记忆整理与来源、外观/API 预设、悬浮切换、关系编辑、IndexedDB 故障回滚回归通过。Android 11 API 30 x86_64 专用 userdata 镜像通过原签名 0.10.0 → 0.11.0 覆盖安装、原业务字段保留、真实内置 Python/OB/SQLite 召回、世界事件知情隔离、进程重启、来源追溯、暂停召回、保存失败回滚和系统触屏/返回验收。模型均为模拟传输；没有调用付费模型。未验证实体手机、真实模型服务或共同后端世界功能。

本机截图与机器可读证据：`artifacts/world-browser-*.png`、`artifacts/world-android-*.png`、`artifacts/world-android-validation.json`。这些使用合成记录，不提交个人运行目录。
