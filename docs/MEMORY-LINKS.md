# 记忆关联第一版

本机网页与 Android 的业务模块共用此实现。源码分支新增功能不代表旧 APK 已经更新；共同后端本轮不提供关联接口。

## 使用

- 桌面 → 记忆 → 任一记忆的“查看关联” → 新建关联。按“起点 → 关系 → 终点”阅读，可选补充、存在矛盾、是另一记忆的起因或结果。
- 桌面 → 自我 → 核心标签的“关联记忆”，可将一条记忆作为该标签的依据。
- 关联列表显示两端标题、说明及方向，可以查看两端内容、点击来源原话、编辑和删除。
- 记忆或标签发生编辑后，旧关联提示复核；编辑关联并保存可确认当前版本。暂停召回仍保留关联。

这些连线是用户确认的解释。连线不改写消息或 Canon/Persona，不自动建立反向关系，不把参与人物当作知情者。当前聊天仍使用原来的身份、历史和 BM25 召回；关联还没有参与模型上下文、自动扩展召回或人格成长。没有自动生成关系候选或完整自由拖拽画布。

## 数据和职责

`memory.links` 是与事件、总结、标签并列的数组。每条记录包含：

| 字段 | 含义 |
|---|---|
| `id`、`owner_id` | 关联标识及所属人物 |
| `from`、`to` | `{kind: memory/anchor, id}`，明确起点和终点 |
| `type` | `supplements`、`contradicts`、`causes`、`results_from`、`supports` |
| `note` | 用户说明，最多 1000 字符 |
| `from_revision`、`to_revision` | 确认关联时的端点版本 |
| `origin` | 首版固定 `manual` |
| `created_at`、`updated_at` | 创建和最近编辑时间 |

`supports` 仅允许“记忆 → 核心标签”，其余类型仅允许“记忆 → 记忆”。两端必须存在、属于同一人物且不是自身；完全相同的起点、关系和终点不重复保存。关联最多 5000 条。不会自动补上另一方向的关系。

事件和标签增加整数 `revision`，旧数据默认为 0；编辑/暂停记忆、编辑标签或更新未保护的 AI 标签时递增。查询通过版本差异给出复核提示。关联本身保留创建与更新时间，首版没有十版修改历史；原记忆和标签的版本记录仍保留。

`memory-links.js` 负责关系规则、校验、端点描述和删除清理；不访问 DOM 或存储。`MemoryModule` 负责路由和业务提交，经已有事务队列保存。`memory-links-ui.js` 只调用接口，承载一个关联对话框，不直接读取内部文档。

## 接口与删除规则

| 操作 | 本机接口 |
|---|---|
| 查询一个人物的关联 | `GET /memory-links?owner={id}` |
| 查询某一端点的入边与出边 | 加 `&kind=memory/anchor&node={id}` |
| 新建 | `POST /memory-links`，输入所属人物、两端、类型和说明 |
| 编辑并确认当前端点版本 | `PATCH /memory-links/{id}`，输入完整关联字段 |
| 删除连线 | `DELETE /memory-links/{id}?owner={id}` |

删除连线只删除连线。删除某条记忆或标签时，其相连的边与端点在同一事务中清理，其他边不受影响，来源消息仍保留。保存失败时，端点和连线一起回到上次成功状态。

用户手动建立的依据连接会保护目标 AI 标签：重新分析名册时，已经有手动关联的标签与人工编辑的标签都保留，避免模型换一个标签名称就丢失连线。用户仍可明确删除标签及其关联；界面会先说明删除范围。

## 兼容与复用

根文档仍为 version 2，记忆仍为 version 1；新增数组与版本元数据是可补默认值的字段。新版本可读取旧备份并补空关联，不修改原话、人物资料或凭据。含有关联的备份应在支持此功能的版本恢复；旧客户端没有关系清理与复核语义。

本轮先检查了 [awesome-ai-companion](https://github.com/DasterProkio/awesome-ai-companion) 的记忆分类，并复核本地固定版本的参考文件：

- [float memory-types.ts，c1b0ea7](https://github.com/Jcin004/float/blob/c1b0ea74d7690beae31bc7c9e2a8c382fa4b151b/lib/memory-types.ts)：条目及来源字段，不是现成的有向关系 CRUD。
- [Serein relation_storage.py，180c94a](https://github.com/Yinglianchun/Serein/blob/180c94a54feb28283aa8af15a4f49a129aa8b397/src/serein/compat/relation_storage.py)：关系投影和 SQLite 事务依赖其 Python 服务。本轮仅研究提交前校验的设计，没有复制文件或引入服务。

实际复用的是已有 T-companion 的来源证据、事务队列、人物隔离、IndexedDB/SQLite 适配、对话框及原话跳转。既有 float、Serein BM25、jsonrepair 模块保留，无新增第三方依赖或素材；具体来源见 `THIRD_PARTY_NOTICES.md`。

## 验证

`tests/memory-links.test.mjs` 覆盖旧备份、全部关系类型、标签依据、双端查询、方向、重复/自身/跨人物拒绝、失效备份、端点版本复核、原子删除、保存失败与草稿交错，以及重新分析保留已关联标签。

`tests/memory-links-browser.mjs` 使用隔离浏览器数据，验证关联创建/编辑、端点查看、原话跳转、标签依据、刷新持久化、删除和人物隔离。模型传输使用测试替身；本轮没有实体手机故障验收。
