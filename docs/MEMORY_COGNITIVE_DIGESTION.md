# 3A · 手动认知消化

状态：0.22.0 / code 35 原签名试用版已发布，等待用户验收。此阶段只包括手动触发的问题/期盼状态处理，不代表自我认知已接入聊天。

## 用户流程

1. 打开“记忆 → 认知消化”，选择当前人物后预览将使用的材料与可点击原始来源。
2. 点击“开始消化”。一次最多读取 8 条尚未人工锁定的阁楼问题/窗台期盼，以及 12 条客厅/卧室有效经历；承诺卡不作为完成证据。
3. 模型对每个待处理目标提出 `keep`、`resolve`、`fulfill` 或 `disappoint` 判断，附理由、信心和独立经历依据。无独立经历时直接记录 keep，不调用模型。
4. `keep` 只写入报告。其他变化保持待复核；用户确认后才更新同一记忆卡。驳回只修改报告。
5. 在应用中重看材料、原话/世界事件来源、处理前后状态与决定；用户可删除报告。

## 唯一数据所有者与边界

- `memory.events[]` 是问题、期盼和经历的唯一记忆实体。`cognition_state` 是可选字段，不增加第二套记忆库；初始 `attic` 状态默认 `open`，`windowsill` 状态默认 `active`。
- 可执行转移：阁楼 `open → resolved`；窗台 `active → fulfilled | disappointed`。用户可锁定手动状态阻止模型建议，也可解除锁定；用户仍可手动编辑。
- `memory.digest_reports[]` 保存本次输入快照与来源 ID、摘要、逐条判断、信心、理由及最终决定。报告最多保留 100 份；新增报告优先清除最早的已完成报告，若 100 份均待处理则拒绝覆盖。
- 生成在事务外调用原 `MemoryModule.generate`；确认在同一个 `MemoryModule.write` 事务内复查目标及依据版本、追加记忆版本、更新认知状态并回写报告。
- 手动修改或删除目标/依据会让旧建议过期或移除依赖报告。取消、模型失败和保存失败不会改变记忆状态或产生完成记录。
- 新字段通过现有业务 JSON 存储与备份恢复；旧备份初始化空报告列表。Android 使用现有 SQLite 文档和事务，不新增原生表/插件。
- 仅支持本机模式。共同后端、本能生活调度、故事时间线、自我稳定认知、自动消化和日/月总结不在 3A 范围内。

## 模块边界

| 文件 | 所有职责 |
|---|---|
| `frontend/memory-digestion-core.js` | 认知状态、允许转移、候选材料窗口、报告验证与来源删除清理 |
| `frontend/memory-digestion-service.js` | 手动运行、模型结果验证、报告、确认/驳回与并发版本复核 |
| `frontend/memory-digestion-ui.js` | 本阶段入口、材料预览、来源链接、报告与人工决定 |
| `frontend/memory-service.js` | 既有记忆 API 所有者；只路由认知消化并提供统一生成/事务/版本接口 |
| `frontend/memory-core.js` | 既有记忆备份校验与旧数据默认值 |
| `frontend/memory-source-deletion.js` | 按既有原话/世界事件删除规则移除失效记忆及其报告 |

界面不直接写业务数据；新模块不打开数据库、不写聊天原文、不调用第二个模型客户端。

## 上游复用与许可来源

项目已按用户 2026-11-01 的补充说明记录：SullyOS 作者授予此处使用源码的公开二次修改权限。源仓库仍显示 [SullyOS Source-Available License 1.0](https://github.com/Jcin004/SullyOS/blob/8035795e443579ead0f28d1dfe9d5a87ff0b232e/LICENSE)，对应文本留在 `frontend/licenses/SullyOS-Source-Available-1.0.txt`；本次适用的是用户报告的作者额外授权。

SullyOS 固定提交 `8035795e443579ead0f28d1dfe9d5a87ff0b232e` 的 [`digestion.ts`](https://github.com/Jcin004/SullyOS/blob/8035795e443579ead0f28d1dfe9d5a87ff0b232e/utils/memoryPalace/digestion.ts)（blob `7caed19094e05ee89d2011ec9ad495c2acce48ba`）和 [`anticipation.ts`](https://github.com/Jcin004/SullyOS/blob/8035795e443579ead0f28d1dfe9d5a87ff0b232e/utils/memoryPalace/anticipation.ts)（blob `9093ed60ded715d8ef5591b545f92c48a992683a`）是本阶段最直接参考。固定提交中的消化文件为 1,152 行多阶段管线，耦合 `MemoryNodeDB`、`AnticipationDB`、`DigestReportDB`、向量服务、自动轮数和 room plate；期盼生命周期也会写新记忆节点。将整套源文件或 DB 直接放入 T-companion 会重复存储和绕开确认事务。

因此 3A 定点适配其候选分组、`keep/resolve/fulfill/disappoint` 状态动作及报告思路；保留 T-companion 既有 `MemoryModule`、证据校验、版本快照、JSON/SQLite 事务和界面。没有搬入上游数据库、向量网络调用、自动消化、自我反刍、门牌或新节点写入。

awesome-ai-companion 目录中的参考：[`MIRROW` MIT 的 source review](https://github.com/EvelynnYu/MIRROW/blob/8299e033be5631530cfbd0add66abca8b224759c/ai-chat-backend/memory_v2/source_reviews.py)采用来源版本绑定的人工审核；其 Python/SQLite 读模型未复制。 [`companion-emergence` MIT 的 review pipeline](https://github.com/hanamorix/companion-emergence/blob/d55635794b1f2e708893ead449439370e1de7b75/brain/soul/review.py)是无人工闸门的自动定案流程，不适合本阶段的确认需求。目录只作发现索引；具体来源、许可和适配记录见 `config/memory-cognitive-sources.json`。

## 程序验收范围

实施后应覆盖并记录：

- 有明确经历佐证时，期盼可以被建议为达成；只有原承诺、缺少结果、相互矛盾或独立经历不足时只能 keep。
- 问题只允许被建议为 resolved；低信心及理由在报告中可读。
- 确认后状态变更一次并保留旧版本；驳回与 keep 不改变状态；重复确认不重复变更。
- 模型生成期间目标或依据版本变化，旧建议不可确认；新材料重新生成后可审。
- A/B 人物隔离、暂停记忆排除、来源删除后报告清理、旧备份恢复、报告持久化与容量边界。
- 网络取消、无效 JSON、事务保存失败后原状态保持；只允许本机模式打开入口。

## 本轮验证记录（2026-11-01）

- `npm test`：179 项通过，覆盖认知消化逻辑与现有 Node 回归。
- `.venv/Scripts/python.exe -m pytest -q -W error`：103 项通过。
- `tests/memory-digestion-browser.mjs`：浏览器预览隔离、固定模型响应、确认/驳回、重载持久化和原话跳转通过。
- `tests/memory-digestion-android.mjs`：Android 11 / API 30、WebView 与原生 SQLite；隔离材料、固定模型响应、确认/驳回、持久写入和原话跳转通过。结束后清空临时模拟器应用数据。
- Debug APK 构建、Web 资源同步及 `git diff --check` 通过。未调用真实模型服务，也未在实体手机上验证；用户验收待完成。

## 0.22.0 试用交付（2026-11-01）

- [下载与匹配源码](https://github.com/Jcin004/T-companion-updates/releases/tag/android-v0.22.0)：原包名、原试用签名、versionCode 35；构建源码 `b946c5efd30db016829fce5bb7592878d579cdb6`，产品源码 [PR #39](https://github.com/Jcin004/T-companion/pull/39) 保持草稿、未合并。
- APK 为 81,409,713 字节，SHA-256 `da165e93fc27523cecdbb316d35515eba4ac2962c48f92564cd7d0aeb3fc42b7`。源码归档 SHA-256 `8fc737da6fea24605f97ffb0c5993d305bd546cdfefbd07439c6cfafd2b0cdb5`。
- APK、精确 Git 源码、许可、署名、构建说明、清单及 SHA256SUMS 共七项公开附件全部核对上传摘要；匿名 APK HEAD 200，公开 API main 清单与本地发布清单一致。
- Android 11 专用模拟器由原签名 0.21.0 / code 34 覆盖到 code 35，完整合成业务文档和加密凭据文件指纹保留；只新增空 digest_reports 默认字段，认知消化页面打开通过。
- 默认原生更新检查首次超时，重试通过 API 备用入口报告当前为最新（19,681 ms，raw 入口失败）；此结果只代表本轮模拟器网络。实体手机、真实模型和用户主观效果待试用。
- 产品提交 [CI](https://github.com/Jcin004/T-companion/actions/runs/41317331399) 的测试、密钥扫描及 Android 构建全部通过；后续交付文档提交不替换安装包的构建源码提交。
