# 记忆房间与月度回顾

本轮对应持续执行文档第 17 节。基线 0.20.2 / code 33，交付目标 0.21.0 / code 34；独立本机网页和 Android，共同后端未增加这些接口。

## 用户操作

桌面 → 记忆 → 选择人物。记忆卡展示房间，可按房间和文字搜索共同筛选；编辑时可调整房间。模型整理新聊天可返回分类，未返回分类时使用客厅。分类与陈述/约定/理解/经历的“性质”分别保存；归入房间不把陈述变成事实，也不让相关人物自动知情。

先按日期生成每日总结，再选择月份 → 查看月度回顾 → 生成。打开页面不调用模型；生成与重写使用现有记忆连接和停止入口。月度材料只有该人物该月已有日总结；不补齐无记录的日期，不读取其他人的材料，不用原始整月聊天替代日总结。可编辑、重写、删除及查看最近十版；展开原话来源可直接回聊天。日总结增删或改写后标记“需要复核”，不自动覆盖人工月度内容。点击当前日总结查看的是最新内容，生成依据另列引用版本。

## 与 SullyOS 的对照

参考固定 `qegj567-cloud/SullyOS@8035795e443579ead0f28d1dfe9d5a87ff0b232e` 的 [记忆系统说明](https://github.com/qegj567-cloud/SullyOS/blob/8035795e443579ead0f28d1dfe9d5a87ff0b232e/docs/memory-system-overview.md)，七房间承担日常、情感、知识、用户资料、自我、困惑、期盼的组织职责；月度精炼由已有每日记录生成。沿用这些操作概念，由本项目现有来源/证据、辅助模型和事务独立实现，没有导入上游源文件、素材、DB 或模型网络封装。

| 能力 | 本轮之前 | 本轮之后 | 后续缺口 |
|---|---|---|---|
| 经历组织 | 平面卡片与性质 | 七房间、按人统计/筛选、人工或模型分类 | 房间生命周期、重要性、巩固和衰减 |
| 日/月回顾 | 日总结和十版历史 | 增加日→月精炼，保存来源/版本，过期提示 | 是否和如何进入统一上下文，需避免与经历重复 |
| 召回 | 原 OB 或词法 + 有限关联 | 原链路继续使用分类后的同一张卡 | 评估房间权重和向量/混合召回，无新增承诺 |
| 消化与自我 | 从名册分析的核心标签 | 保留；分类不自动更新自我 | 经历消化、状态变化、稳定认识和报告 |
| 虚构剧情 | 预留来源边界 | 保留隔离 | 剧情归档、选择转入、来源版本/接收者/回执 |

SullyOS 有传统档案与宫殿两条兼容路径，本项目不据此再造一套独立可编辑的长期记忆。月度回顾本轮用于查看；不会同时作为额外长期记忆注入，原经历仍可召回。

## 文件分工与依赖

- `memory-rooms.js`：分类代码、标签、描述与合法值，一处定义。
- `memory-monthly.js`：月度材料选择、限额、指纹、过期判定和备份验证；没有 DOM、网络或持久化。
- `memory-service.js`：现有 MemoryModule 唯一写入/模型调用所有者；在 LocalService 事务内复核来源并保存。
- `memory-core.js`：复用原卡片及证据验证，接分类和月度校验。
- `memory-source-deletion.js`：原话删除时清理依赖它的月度档案及历史；单删日总结只令月度回顾过期。
- `memory-ui.js` / `memory-monthly-ui.js`：现有记忆页面和月度窗口，经 API 读取/编辑；无第二套日总结或存储。

调用依赖：UI → LocalService API → MemoryModule → 材料/证据规则；模型调用复用 auxiliary，写入复用 transact。浏览器持久化与 Android SQLite/CAS 沿用原适配，内置 OB 继续只索引原记忆卡，没有索引第二份月度副本。

## 数据建议已落地

`events[].room` 为七个稳定代码之一：living_room、bedroom、study、user_room、self_room、attic、windowsill。缺字段的旧卡仅读取时视为客厅，编辑才写入；非法显式值拒绝。原 evidence、participants、origin、active、revision 和 versions 保留。

`summaries[].revision` 缺失视为 0；生成或编辑递增。新增 `memory.monthly_summaries[]`，每张含 id、owner_id、month、content、source_ids、summary_refs（id/revision）、revision、origin、updated_at、versions。source_ids 是该次日总结引用的原话并集，不从最终概述反推证据；summary_refs 记录确切日总结版本。日总结旧版本被清理后仍有原话链；删除日总结不伪造仍然有效的版本。每人物/月最多一张当前回顾，最多十个历史版本。

主备份 version 2 / memory.version 1 不变，只补可选空数组；不增加原生表或复制消息。生成材料上限 31 个日总结、JSON 120000 字符，超限前置拒绝，不截断材料；单张正文最多 10000 字。模型格式错误、取消、材料/目标变化或磁盘失败均不修改旧回顾。完整来源指纹在原事务拿到最新存档后再次核对；同一服务的模型动作仍串行。

## 接口边界

| 接口 | 作用 |
|---|---|
| GET /memories?owner=&q=&room= | 同一经历库按人物/文字/房间过滤；省略 room 返回全部 |
| GET /memories/rooms?owner= | 七房间总数和启用召回数；不会创建记录 |
| POST /memories、PATCH /memories/:id | 原接口增加 room；旧调用不传 room 时保留已有分类 |
| POST /memories/extract | 原整理入口可返回 room，整批验证后保存/推进进度 |
| POST /summaries/generate、PATCH /summaries | 原日总结接口，增加递增 revision |
| GET /monthly-summaries?owner=&month= | 按人物/月读取，返回计算字段 stale |
| POST /monthly-summaries/generate | 从当前日总结生成并原子保存；owner_id/month |
| PATCH /monthly-summaries | 编辑 content；owner_id/month，保留原引用并增加版本 |
| DELETE /monthly-summaries | 删除该月回顾与版本；不删除日总结或原话 |

`stale` 只读，不写入持久化。月度回顾没有自己的模型连接/凭据。story 来源仍由上一阶段的资格规则排除。

## 验收与交付

172 项 Node、103 项 Python（警告视为错误）通过。9 项新增接口测试覆盖旧卡与分类、非法批次回滚/进度、时区月界/人物隔离、日→月引用、编辑过期、并发变化/磁盘失败、材料限额、备份/历史与原话清理。新增手机尺寸浏览器流程及原记忆浏览器回归通过，模型全部模拟。

专用 Android 11 / WebView 83 的 11 项验收通过：原签名 code 33→34 覆盖、完整旧合成业务数据仅补空月度数组、凭据指纹保留、旧卡分类、真实 Python/OB 召回、旧日总结 v0 月度精炼、人物隔离、过期提示、人工编辑/历史及备份恢复、进程重启、原生 WebView 页面。设备只含隔离合成材料，月度生成仅一次模拟模型；真机和真实模型未验证。记录在 `artifacts/memory-monthly-android-validation.json`。最终提交构建和渠道验证结果在交付记录追加。

## 下一批任务

认知消化的输入窗口、状态/版本、报告和人工保护按持续执行文档第 17 节实施；先有有据可查的状态变化，再评估稳定认知如何参与选择。不用不断给原总结再总结制造“成长”。剧情选段转入和线上处境/可沉默消息按其后续依赖推进。
