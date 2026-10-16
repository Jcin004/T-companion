# 记忆方案比较与 T- 下一阶段建议

核对日期：2026-10-16。检查了用户仓库的实际文件，以及 [awesome-ai-companion 的 Memory 分类](https://github.com/DasterProkio/awesome-ai-companion#memory-identity--emotion-state)。目录用于发现候选，判断依据是各项目源码或自身文档。本轮完成上下文条数控制，不宣称长期记忆已经接入。

## 对照结果

| 项目与检查文件 | 已有方式 | 对 T- 的价值与接入范围 |
|---|---|---|
| [float memory-types](https://github.com/Jcin004/float/blob/main/lib/memory-types.ts)、[summarizer](https://github.com/Jcin004/float/blob/main/lib/memory-summarizer.ts)、[service](https://github.com/Jcin004/float/blob/main/lib/memory-service.ts) | 短期事件、长期条目、核心条目分层；按事件间隔总结，保留原事件；按预算注入，向量可选，缺少向量时按新近度填充 | 适合手机端配置方式、角色隔离、独立总结 API 和预算。现有模块依赖其设置/存储/时间线适配器；选定具体文件后再按既有复用规则核对版本与依赖，不复制私人设定或整套提示词 |
| [SullyOS memory overview](https://github.com/Jcin004/SullyOS/blob/master/docs/memory-system-overview.md) | 传统日/月总结与向量记忆宫殿；按角色维护归档水位、房间分类、手动原文范围；各入口共用范围规则 | 参考独立记忆应用、整理进度和手动控制。七房间与完整归档链不纳入第一版；本次仅研究设计，无源代码导入 |
| [AionsHome memory.py](https://github.com/Jcin004/AionsHome/blob/main/aion-chat/memory.py) | 日常/长期重要记忆分类、向量召回、原消息 ID、来源时间范围、分阶段整理 | 优先参考来源追溯与时间显示。Python 服务及现有配置依赖需要适配；本机手机模式首版采用现有本机数据库承载 |
| [Ombre-Brain INTERNALS](https://github.com/Jcin004/Ombre-Brain/blob/main/docs/INTERNALS.md)、[retrieval engine](https://github.com/Jcin004/Ombre-Brain/blob/main/src/ombrebrain/retrieval/engine.py) | Markdown 记忆桶、关键词/BM25/向量得分及衰减，MCP/REST；检索跟踪输出候选与通道 | 适合作为未来可选 MemoryProvider 服务。先沿用可追踪召回的思路；情感坐标与遗忘评分需要 T- 自己的数据评估，不能直接套参数 |
| [WrenWen 召回打分](https://github.com/Jcin004/WrenWen/blob/main/docs/01-%E8%AE%B0%E5%BF%86%E5%8F%AC%E5%9B%9E%E6%89%93%E5%88%86.md) | 库内准入、跨源合流、去重、相关度门槛和使用痕迹；允许零召回 | 参考“候选不等于注入”、相关度不够就不带入，以及日志解释。它是设计文档，评分阈值来自作者的数据，不作为 T- 的默认参数 |
| [Serein README](https://github.com/Yinglianchun/Serein)、[LICENSE](https://github.com/Yinglianchun/Serein/blob/main/LICENSE) | SQLite 正文/版本/证据绑定，主模型写 Scene、后台整理 Event；混合候选经重排准入，区别准备与实际交付；Hook 可接现有宿主 | 对证据与状态设计最有参考价值；MIT 文件已查看。若采用现成服务，可接 Hook 适配器；手机独立使用首版先落本机兼容数据结构，避免引入常驻外部服务作为必要条件 |
| [Paramecium README](https://github.com/Shitsuten/paramecium) | 原文层、摘录层、画像层；检索原始聊天；摘录要求逐字证据；摘要不替代原文 | 优先参考原文档案、证据校验与矛盾保留。当前只核对设计说明，未导入任何代码 |

## 建议的首版结构

1. **原文**：继续使用现有聊天记录，按角色、消息 ID、说话人及时间定位。不因总结而删除。
2. **记忆条目**：内容、角色、来源消息、事件时间、类型、状态、版本。区分用户陈述、角色理解、实际约定；模型总结不能直接改 Canon。
3. **检索索引**：关键词先可用，向量作为可选增强；索引可重建，不能成为唯一正文来源。
4. **召回记录**：候选、实际选中、注入文本、来源 ID、字符/预算占用。复用运行日志展示，并允许零召回。

记忆整理成功落库后才推进进度；失败重试不重复写入、不跳过原文。自动整理可按累计条数触发，也可手动选区整理。总结使用哪个 API、是否启用向量都可设置，开启需要额外模型调用的功能时清楚展示其用途。

## 可见界面与验收

- 桌面新增“记忆”应用：按角色查看、按时间/关键词查找、查看来源、编辑、停用/删除、导出。
- 聊天详情分别控制“原文历史范围”和“长期记忆召回”，两者不能混成一个条数。历史=0 不应暗示关闭未来的长期召回；各自关闭后，仅使用人设与本次输入。
- 待确认与有矛盾的条目保留状态，不覆盖已确认身份。
- 验收：超过短期窗口的原话可通过记忆正确召回；角色隔离；原文可核对；停用后不再注入；失败不推进整理进度；无相关记忆时不硬凑；手机关闭电脑仍可完成基本记忆流程。

## 本轮已实现的短期上下文控制

设置 → 聊天上下文：全局 0–2000 条，默认 30。聊天详情 → 历史消息范围：跟随全局或单独覆盖。自己与角色各算一条原始消息，分条气泡不增加条数；仅计算已完成历史，人设与本次输入不计入。0 不携带历史。条数不是 token 数，模型服务自身的上下文容量仍适用；超限不会偷偷删除聊天或假装自动压缩。

浏览器、Android 共用本机逻辑；共同后端也支持。设置可随备份恢复，旧库缺失字段时继续按 30 条，运行日志展示设置值与实际历史数。本轮不安装外部记忆服务、不调用真实总结/向量 API、不公开任何仓库。
