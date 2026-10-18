# AI 关联候选（0.9.0）

## 使用与作用范围

本机网页和 Android 共用实现。记忆 → 某条记忆 → 查看关联 → AI 关联候选 → 选择材料并生成候选。人工核心标签也可从“关联记忆”进入。

只发送显式勾选的 2–12 项当前人物材料；默认仅勾选入口这一项，需再选择材料。可搜索，展开核对正文和原话。超过 48000 JSON 字符则拒绝，不截断来源；每次最多返回 8 条。使用原记忆专用模型连接，未指定时跟随当前聊天连接；属于手动模型调用，不自动触发。停止按钮或关闭候选页尝试取消生成，半截 JSON 不保存。

候选保存在 memory.link_proposals，不是 memory.links。召回只读取已复核 links，因此候选的存在、拒绝和删除不会改变聊天。确认前可调整关系类型与说明；确认事务一次保存人工复核关联、已处理状态与当时确认结果。AI 原始理由、两端引文仍在候选记录中。原话仅证明引用出处，不自动证明因果或人格结论。

关系仍为原五类：补充、矛盾、起因、结果、标签依据。两端属于同一人物；标签依据只允许记忆指向人工保存、名册仍有效的标签。没有群聊、多人共同事件或世界状态能力。

## 校验与生命周期

- 生成前验证来源、活动状态与人物范围。只提供选中节点的正文和引用，不旁路读取其他原文。
- 每条候选需引用两端各自的连续原话；记忆引文须来自提供的 evidence，标签引文来自 quote。无效批次整体拒绝。
- 模型生成在事务外进行，写入事务中重读并比对所选材料。途中编辑、停用或删除材料不允许保存旧结果。
- 确认时再次核对端点版本、来源和名册快照。过期候选不允许直接确认，需重新生成；拒绝仍可进行。
- 同人物、同方向、同类型、同版本的重复候选不重复保存；拒绝会抑制同版本再次提议。主动删除候选后允许重新提出。
- 已有相同人工关联不会被候选覆盖。双击确认或重复请求不创建第二条边；保存失败时边和候选状态一同回滚。
- 删除候选不删除已确认关联；删除关联不删原话。删除记忆或标签时同事务删除相连候选与关联。候选最多 500 条，可删除已处理记录。
- 根文档 version 2、memory.version 1 保持不变；旧备份补空候选数组。候选随普通备份保存，不含密钥。恢复应使用支持候选的当前版本；旧客户端不具备其清理语义。

## 职责和接口

| 模块 | 职责 |
|---|---|
| memory-link-proposals.js | 选材、证据、关系与候选状态验证，只读投影 |
| memory-link-proposal-service.js | 生成、去重、复核及事务；复用 MemoryModule.generate/write |
| memory-link-proposals-ui.js | 勾选、预览、生成、停止、确认/拒绝与历史 |
| memory-links/core/service | 原关系、记忆文档与兼容接线，不另建存储或下载器 |

本机接口：GET /memory-link-proposals?owner=ID（可加 kind/node 筛选）；POST /memory-link-proposals/generate（owner_id、refs）；POST /memory-link-proposals/ID/accept（owner_id，可调整 type/note）；POST /memory-link-proposals/ID/reject（owner_id）；DELETE /memory-link-proposals/ID?owner=ID。Python 共同后端不提供本次候选功能。

## 复用核对

优先复用现有 linkValue/linkNode、来源校验、模型连接、float 衍生 JSON 清理、jsonrepair、取消和 LocalService 事务。保留已有 Serein BM25/追问适配；未新增运行依赖或第三方源码。

核对 awesome-ai-companion 分类，并检查固定版本 float memory-types.ts（c1b0ea74d7690beae31bc7c9e2a8c382fa4b151b）的条目/来源结构，以及 Serein compat/relation_storage.py（180c94a54feb28283aa8af15a4f49a129aa8b397）的服务端关系存储。前者不是人工确认候选的状态流程，后者依赖 Python/SQLite 服务，不能直接替代独立 APK 的当前事务。此次参考其结构，未移植文件或私人设定。已有导入模块的来源/许可继续见 THIRD_PARTY_NOTICES.md。

## 验收

tests/memory-link-proposals.test.mjs 覆盖候选不影响召回、确认方向、改动记录、重启/备份、人物隔离、去重/拒绝、无效引文、范围、陈旧节点、删除、失败回滚、异步重校验、专用模型与取消。浏览器验收覆盖真实勾选、请求材料、人工修改、父列表刷新、持久化、过期和拒绝；默认模拟模型，不调用付费服务。Android 使用隔离模拟器验收，实体手机与真实模型效果另行区分。
