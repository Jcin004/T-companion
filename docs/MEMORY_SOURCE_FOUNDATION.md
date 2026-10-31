# 记忆来源与归属基础：第一小阶段

日期：2026-10-31。版本：0.20.1-trial / versionCode 32。实施基线为 `be89b48`（0.20.0 的交付记录提交），保留已发布 0.20.0 的分部件衣柜等能力。

最初审计目录停留在 0.14.1；发现更新渠道已发布 0.20.0 后，工作迁到已有、干净的 `T-companion-world-expression`，分支 `feat/memory-source-current`。原目录的 `tests/world-motion-android.mjs` 未提交修改保持原样，不进入本阶段提交。

## 本阶段解决什么

原来源查询只按人物查会话，新增独立剧情时会被当作普通来源。联系人和主动投递则用“非 world”识别日常会话，可能误用剧情。生成历史另有一套完成消息筛选，而且没有排除已撤销轮次。

本轮集中来源资格：旧版无 mode 和显式 online 是日常会话，world 是现有世界会话；story 是预留的独立类型，不能通过普通聊天入口读取主记忆或调用模型。它还不是可操作的剧情功能。

提取、每日总结、来源选择/定位、词法或内置 OB 的最终召回和关联展开、实际模型历史都使用同一份合规原文。未完成轮次不能作为角色已经知道的经历；本阶段没有实现独立手机阅读状态或“已读不回”。

## 模块与接口

| 文件 | 职责与替代位置 |
|---|---|
| `frontend/session-mode.js` | 集中会话模式解释和普通主记忆入口校验，替代多处 mode !== world 判断 |
| `frontend/memory-evidence.js` | 集中完成来源轮次、消息、世界来源投影及来源定位/逐字证据，保留原导出兼容 |
| `frontend/memory-service.js` | 整理进度从统一来源取材；来源查询支持 source_type；保存仍走原事务 |
| `frontend/memory-recall.js` | 在来源和关联筛选前核验会话，拒绝独立剧情走普通入口，关闭召回也不绕过此检查 |
| `frontend/local-queries.js` | 实际历史复用来源查询，不再独立维护完成消息筛选 |
| `frontend/local-service.js` | 联系人只选 online；模型/OB/远程召回前拦截不支持的独立剧情入口 |
| `frontend/world-core.js` | 知情规则由世界拥有，单条和列表共用判断 |
| `frontend/world-service.js`、`proactive-messages.js` | 来源兼容入口复用投影；新场景继承偏好和主动投递只使用日常联系人 |

本机查询：`GET /memory-sources?owner=ID` 保留聊天来源行为；`source_type=chat_message` 等价；`source_type=world_event` 返回该人物已知的世界来源；非法类型明确拒绝。原 `/world/sources?owner=ID` 保持兼容，复用同一实现。

来源类型和会话类型是两回事：线上、世界中的完成对话仍是消息来源；世界事件是带知情范围的事件来源。引用世界事件不授予被提及人物知情权。

## 数据、平台与验证

本阶段没有写入剧情实体、转入回执、阅读状态或零外发消息生成结构，业务文档/备份仍为 version 2，旧 ID、原文、证据、关联、人物和配置保留。主记忆中已有来源非法的条目不会被默默删除；校验拒绝无效依据，召回排除无效材料。

适用于本机网页和 Android，共用 JS 规则。Android 继续用 SQLite 与内置 OB；网页保留原词法/可选只读网关。共同后端没有获得剧情或新记忆能力。

- 新增 7 项接口测试：隔离来源、提取/日总结/历史一致性、撤销与未完成、关联旁路、阻断前不调用模型、兼容来源、失败回滚和旧备份。
- 当前 161 项 Node、103 项 Python（警告按错误）通过，均使用合成数据或模拟模型。
- 浏览器与 Android 的执行结果在交付记录中追加；不能把 Node 模拟插件当作设备验证。

## 下一步任务

1. 设计并验证剧情自己的来源/版本与显式转入回执，然后实现选段转记忆。不能因为已预留 story 类型就声称剧情转入已实现。
2. 接宫殿分类、长文分批、日/月回顾与稳定认知；采用下节的具体模块依赖评估决定复用方式。
3. 再接认知消化和线上情景协议；世界/生活保持活动状态唯一所有者。

## SullyOS 逐模块复用审计

固定版本：`qegj567-cloud/SullyOS@8035795e443579ead0f28d1dfe9d5a87ff0b232e`。逐文件 blob、SHA-256、直接 import、行数及决定保存在 `config/sullyos-memory-reference-sources.json`；这是设计参考清单，本阶段未复制其实现或素材。

| 上游文件（utils 下） | 直接依赖与检查结果 | 本阶段决定／后续任务 |
|---|---|---|
| `memoryPalace/pipeline.ts` | 2,502 行；连接角色 DB、上下文范围、提取、向量、关联、召回、交互评分和进度 | 不整体导入；以其共用入口为参考，先在当前记忆所有者内收口来源 |
| `memoryPalace/autoArchive.ts` | processNewMessages 后保存神经链接档案与隐藏进度；依赖 DB、MemoryNodeDB、pipeline 和 UI 同步事件 | 保留成功后推进与引用关系思想，接原 LocalService 事务；不复制双存储与 UI 事件 |
| `memoryPalace/highWaterMark.ts` | localStorage 与 IndexedDB 镜像及修复逻辑 | 当前进度与条目已在同一业务事务；保留语义，不增加第二份镜像 |
| `memoryPalace/extraction.ts` | 依赖其 Message、节点类型、消息格式、安全网络、JSON、时间与召回 trace | 长文分批及提取规则作为后续候选；模型调用改接现有主/副连接，来源不能丢 ID/引文 |
| `memoryPalace/hybridSearch.ts` | 依赖节点 DB、Embedding、向量搜索、BM25 索引和巩固评分 | 先明确候选接口、离线能力与评测，再决定向量及评分复用；不把当前 OB 定为唯一终局 |
| `memoryPalace/digestion.ts` | 1,152 行；依赖记忆/期盼/报告 DB、向量写入、模型与进度 | 消化状态和报告为后续核心任务；需与现有自我区分，输入改为合规经历，不能直接接原 DB |
| `memoryPalace/roomPlateCore.ts` | 合并、限量、标签映射及提示构造；依赖房间类型/常量和 JSON 解析 | 相对独立的复用候选；需核验来源/人工保护语义、授权和最小依赖后再引入 |
| `memoryPalace/roomPlates.ts` | 依赖 ContextBuilder、DB、模型、localStorage 和 core | 不整体引入；稳定认知与界面分工继续用一个所有者，不能循环总结为新的经历 |
| `storyTheaterMemoryConversion.ts` | 同一次 IDB 事务写正文/向量/传统档案/剧情回执，并再次核对来源和接收者 | 采用版本核对、接收者与回执去重规则；下一阶段接当前事务，不引入其 DB |

SullyOS 原版 `autoArchive` 与 `pipeline` 有兼容传统档案的桥接；这不表示 T-companion 应新增一套独立长期记忆库。日/月回顾和经历之间用来源引用保持一致。

授权：用户已说明有个人非商业二改权，仓库已有相关记录。后续实际复制时逐文件记录授权覆盖、作者/许可/依赖与修改；公开源码/APK 的分发范围另按已有规则核对。本阶段无新增上游实现，因此不会把来源可见许可混入当前 AGPL 产品代码。
