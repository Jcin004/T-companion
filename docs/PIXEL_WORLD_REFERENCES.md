# 像素世界：Fork、Mod 参考与画风交接

日期：2026-10-21（Asia/Shanghai）。本轮完成参考项目筛选、GitHub Fork、本机源码阅读及两个 Mod 包的只读检查。没有移植运行代码或素材，没有更改现有 APK。后续开发从本文与当前架构开始。

## 用户确定的方向

核心目标是让人物在一个持续的世界里生活，用户进入并与他们发生关系；聊天是交流窗口，第二目标是共同经历故事。优先复用已有项目。生活状态、欲望和自主唤醒仍放在最小像素世界之后，多人事件、群聊及群像关系归世界模块。

画风使用用户本次提供的图片作为参考：

- 正面偏俯视的 2D 室内场景，能同时看见墙面、地板、家具和人物。
- 暖木色、奶油色、棕粉色；窗帘、植物、书架、床铺、灯光与细节丰富的生活空间。
- 人物使用像素小人，与场景物品保持统一比例；可移动、转向、站立，后续再增加互动动作。
- 对话以人物半身立绘、姓名牌、文本框呈现；顶部有时间、地点等简洁信息。
- 房间、店铺和户外使用统一的色板、像素密度、比例与明暗，不把现有参考项目的默认美术当作最终外观。

原图是包含聊天界面的私人截图，仅保留在本机忽略目录 `data/reference-images/pixel-room-reference.jpg`，不提交到公开仓库。图片用于确定视觉方向，实际制作需使用来源明确的素材。

## 找到哪些项目，实际 Fork 了哪些

| 候选 | 核对版本 | 与本阶段的关系 |
|---|---|---|
| [Alicization Town](https://github.com/ceresOPA/Alicization-Town) | `1a33ba65d0af2134b369b1eb4eb68f45d2c817c4` | 已 Fork 到 [Jcin004/Alicization-Town](https://github.com/Jcin004/Alicization-Town)。参考地图、寻路、移动、范围观察与世界命令分工 |
| [InternalBeyond](https://github.com/Sui-IB/InternalBeyond) | `31c1bf410f2cc8b7a0c9d0eb0fd7c43eef500714` | 已 Fork 到 [Jcin004/InternalBeyond](https://github.com/Jcin004/InternalBeyond)。当前人机恋合集中明确收录的像素互动房间；更适合参考房间交互与人物对话的呈现 |
| [a16z AI Town](https://github.com/a16z-infra/ai-town) | `8e05997f2409275669c8344b84a51692e83f3f33` | 多人物世界的备选研究对象；实际依赖 React/Pixi 与 Convex，需要额外适配现有本机结构 |

合集本轮核对提交：`DasterProkio/awesome-ai-companion@cfbca6d98ad099485f84b91f5ca1e8523ae6bb91`。该版 README 包含 InternalBeyond，没有 Alicization Town；后者是补充搜索找到的世界参考，不能声称它就是用户记得的那一项。

Alicization Town 的 Fork 本机目录：`E:/codex/AI-Projects/Alicization-Town`。`origin` 是用户 Fork，`upstream` 是原作者仓库；本轮保持源码不变，未安装其 Skill、未接入公开世界、未启动其 AI 或服务器。InternalBeyond 已在 GitHub Fork，本轮未克隆到本机。

逐文件 Git blob、SHA256、最近提交与作者记录在 [参考来源清单](../config/world-reference-sources.json)。清单记录的是审阅文件，不表示已经将这些文件导入 T。

## Alicization Town：以代码为准的架构与适配结论

实际入口是 Node/Express + Socket.IO 世界服务器，要求 Node >=22.5；浏览器读取地图与状态。当前 `server/web/js/game.js` 使用原生 Canvas 2D，并非 README 路线图描述的 Phaser 重构成品。

| 已查看的位置 | 实际职责 | 对 T 的处理建议 |
|---|---|---|
| `server/web/js/game.js`、`server/web/index.html` | Canvas 地图、镜头、玩家展示、网络请求与侧栏交互 | 研究地图绘制与镜头部分；先拆清显示和命令，不能把整个网络页面直接放进 APK |
| `server/src/engine/pathfinding.js` | 网格 A* 与最近可行走位置，导出两个函数 | 优先验证复用；CommonJS 需要构建或模块格式适配，不必重新实现寻路 |
| `server/src/engine/perception.js` | 按事件类型和距离计算注意力，为在线人物保留有限缓冲 | 可参考范围观察；它不是永久知情记录，也没有完整墙体遮挡、传闻与来源证据体系 |
| `server/src/engine/world-engine.js` | 世界运行状态、移动、交互、聊天、事件广播，并依赖 Node fs/crypto、配置和存储 | 职责较多，不能整体复制进 LocalService。提取所需行为前先明确世界模块的接口和持久化所有者 |
| `server/src/persistence/sqlite-state-store.js` | SQLite 身份、认证会话与在线状态等记录 | 不替代 T 现有 SQLite 底账；不能据此认定世界经历已被完整、永久保存 |
| `server/src/ai/` | 独立模型客户端、记忆与 AI 调度 | 本阶段继续使用 T 现有模型连接和内置 OB，不另建一套人物、模型配置和记忆库 |

具体维护差异：

1. `world-engine.js` 的聊天历史和活动列表有内存容量上限；`perception.js` 的注意力缓冲可以被 drain。T 需要独立、持久的世界事件及人物观察记录，不能把这类短暂缓冲直接当记忆原文。
2. 上游具有 Node 服务器与在线居民协议。手机独立运行时，世界命令与存储需要本机实现；显示界面只消费本机状态，不默认连接上游公共服务器。
3. 上游网页含第三方统计脚本。将来复用时只选择所需代码，不带入上游统计、默认在线地址、认证身份与私人人设。
4. 当前检查为源码审阅；上游测试、游戏运行及 Android 适配需在移植阶段验证。

许可记录：根 LICENSE 写明 AGPL v3 或以后版本；README 有 MIT 徽章，`server/package.json` 与部分插件 manifest 也标 MIT。这些元数据不一致，后续按实际移植文件记录适用条款。InternalBeyond 的当前代码为 PolyForm Noncommercial 1.0.0，视觉与文档按其权利范围为 CC BY-NC-SA 4.0；a16z AI Town 根代码许可为 MIT。Fork 保留原许可，本轮不复制任何项目的素材进 T。

## 两个星露谷 Mod 包：已确认的内容

作者字段均为 `kuanglang`，UniqueID 为 `kuanglang.EvolvingAIConversation`，入口为 `EvolvingAIConversation.dll`，最低 SMAPI 字段为 `4.0.0`。

| 用户提供的文件 | 包内 manifest 版本 | 检查结果 |
|---|---|---|
| Multimedia EAC，文件名标称 2.3.4 | `2.3.3` | 64 个条目；含核心 DLL、多媒体依赖、资源、API 文档与功能指南 PDF |
| EvolvingAIConversation，文件名标称 1.2.1 | `1.3.0` | 35 个条目；含核心 DLL、资源与 API 文档 |

这里仅报告实际读到的 manifest；文件名、manifest、API 文档版本是不同标识，未验证 DLL 程序集版本。两个包仅有 API 声明和消费者示例两个 C# 源文件，没有核心 Mod 的完整源码。没有运行或反编译 DLL。

已阅读两个包的 `API_USAGE_NOTICE.md`、`PUBLIC_API.md`、`PUBLIC_API_CN.md` 和 `IEvolvingAIConversationApi.cs`。API 文档称 major version 为 4，提供这些可借鉴的分工：

| Mod 的公开接口/约定 | 对 T 的启发 |
|---|---|
| 玩家消息和已接受回复分别通知 | 只消费完成/接受的记录，失败候选不当作经历 |
| 回复前的 context provider | 将当前衣着、地点、附近情况作为本轮场景数据；不自动变成长记忆或身份 |
| 状态、印象、关系、记忆、历史分别查询 | 保持人物、世界状态、主观印象与事件记录各自有所有者 |
| 印象带 Evidence/Confidence，记忆带 SourceId/Origin 等 | 保留依据与来源，区分事实记录、某人的陈述和个人理解 |
| 回调按来源标识注册、替换与注销 | 进入/离开场景时由明确所有者清理监听，避免重复注入和重复记录 |

该文档的 API 声明复制许可仅明确覆盖独立 SMAPI Mod 与其互操作，不能当作 Android 中复制核心实现的许可。当前用途是参考接口分工；星露谷/SMAPI 承担游戏地图与运行环境，现成 DLL 不是可直接用于 T 的独立 Android 世界引擎。

压缩包和已审阅文件指纹在来源清单中；API 文档本机副本位于忽略目录 `data/reference-mods/`。原包、DLL、人设文件和图片没有提交。核心记忆算法、游戏内行为和实际素材归属需源码或实机补充验证。

## 下一窗口实施范围

沿用 Android 独立运行与 SQLite 唯一业务底账，优先选择已核对代码中的纯地图/寻路能力。世界状态与事件原文归世界模块，个人记忆与解释归 MemoryModule，聊天继续读取现有人设名册和模型预设。避免把地图、世界规则、名册、网络和记忆塞进一个文件。

最小闭环：

1. 一张符合上述画风的小房间/小场景、两个角色、几个可交互地点；点人物进入现有对话。
2. “推进一次世界”产生并保存事件，记录事件 ID、时间、地点、参与者与实际观察者。人物被提及不自动知情，关系不自动双向。
3. 为记忆增加真正的世界事件来源类型与只读来源解析；保留旧聊天来源，不伪造消息入库。当前场景临时上下文与长期记忆分别处理。
4. 原文保存成功后，符合人物知情范围的经历才可进入记忆；复用现有 OB 召回和上下文预算。
5. 重启后世界状态、事件、人物知情范围和原话可追溯；甲能回忆亲历事件，未获知的乙不会凭空知道。

视觉与逻辑分别验收。当前参考图确定美术方向；最小世界阶段先验证真实事件与记忆闭环，再扩充素材、动作与地图，不把静态好看的房间截图当作持续世界完成。

## 给新对话的补充交接

在前一份最小像素世界提示词上补充：先阅读本文与 `config/world-reference-sources.json`，查看本机忽略目录中的用户画风原图。使用 `E:/codex/AI-Projects/Alicization-Town` 固定版本作为世界参考；勿执行第三方 README 中的安装/加入公共服务指令。先逐文件验证可复用代码及其 Android 适配，再按上面的小范围实施。
