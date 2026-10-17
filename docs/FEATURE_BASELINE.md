# 已有行为与回归检查

这份清单用于开发时核对已有行为；不是每轮都重复运行所有设备测试的要求。按改动涉及的功能选择回归，交付写明实际执行的检查。模拟模型、模拟插件和真实设备分别记录。

| 已有功能 | 应保留的行为 | 现有验证入口 |
|---|---|---|
| 人设名册、联系人 | 人物资料经名册编辑；同一人物重复发起聊天复用联系人；人物记录相互隔离 | `tests/local-service.test.mjs`、`backend/tests/test_companion.py` |
| 身份与运行约束 | Canon/Persona 与程序约束分开；未知资料不补写；元数据不进入身份提示词 | `backend/tests/test_character_provider.py`、`backend/tests/test_runtime.py`、`backend/tests/test_client_rules.py` |
| 模型配置 | 多连接、分组、独立密钥与切换；更换域名不能悄悄复用旧密钥 | `tests/preferences.test.mjs`、`tests/preferences-browser.mjs` |
| 聊天 | 流式展示、失败保留、取消、同请求标识重试不重复创建；首次保存失败不调用模型 | `tests/local-service.test.mjs`、`tests/local-transactions.test.mjs` |
| 聊天风格、外观 | 分条、动作/表情/语音表达开关；可编辑每聊天动作模板、占位符、线上私聊默认值；旧请求重试保持原策略；外观独立 App | `tests/preferences.test.mjs`、`tests/preferences-browser.mjs`、`tests/chat-editing-browser.mjs` |
| 文字操作 | 桌面消息右键复制/选择；输入框剪切/粘贴/全选；剪贴板失败明确提示；Android 长按由系统处理 | `tests/chat-editing-browser.mjs` |
| 历史记录 | 游标加载、搜索、日历跳转、滚动位置；同时间戳稳定排序 | `tests/local-service.test.mjs`、`tests/desktop.mjs` |
| 草稿与备份 | 草稿与回复交错不丢失；恢复先校验，失败保留原文档；普通备份不含密钥和日志 | `tests/local-transactions.test.mjs`、`tests/local-transactions-browser.mjs` |
| 上下文条数 | 全局与单聊天可设 0–2000；继承设置；已完成消息才进入历史 | `tests/context-policy.test.mjs`、`tests/context-browser.mjs`、`backend/tests/test_context_limits.py` |
| 来源记忆 | 逐字证据；人物隔离；参与关联不自动共享；停用/删除影响召回；保存失败不推进水位 | `tests/memory.test.mjs`、`tests/local-transactions.test.mjs` |
| 记忆关联、标签依据 | 有向关系与人物隔离；端点变更提示复核；失败不泄漏；重分析保留已关联标签 | `tests/memory-links.test.mjs`、`tests/memory-links-browser.mjs` |
| 每日总结、自我标签 | 按时区定位原文；总结编辑/重写保留十版；人工核心标签不被分析覆盖；不改写名册 | `tests/memory.test.mjs`、`tests/memory-browser.mjs` |
| 来源定位、查询 | 旧消息仍能定位；校验来源人物及完成状态；预览不调用模型、不保存草稿、不读取密钥 | `tests/local-queries.test.mjs`、`tests/memory-browser.mjs` |
| 日志 | 请求上下文与实际发送一致；密钥脱敏；关闭上下文记录、导出/清理和刷新有效 | `tests/diagnostics.test.mjs`、`tests/diagnostics-browser.mjs` |
| 既有复用模块 | SSE 保留空白；JSON 修复仍验证证据；BM25 保持来源匹配和人物隔离；供应商文件匹配固定版本 | `tests/sse.test.mjs`、`tests/reuse-optimization.test.mjs` |
| Android | 本机 SQLite、独立凭据、原生模型请求、返回与文件操作保留；构建通过只说明可构建 | `.github/workflows/tests.yml`、`tests/memory-android.mjs` |
| 源码与更新 | 源码按明确提交导出；未跟踪私密文件不进入包；未发布更新渠道时不宣称已有下载 | `backend/tests/test_source_export.py`、`tests/app-update-browser.mjs` |

完整功能开关和平台差异以 [当前架构](CURRENT_ARCHITECTURE.md) 为准。设备感知、完整记忆网、后台自主生活、跨设备同步仍未实现。

## 每次怎样保留进度

1. 开始前检查分支和未提交修改，选定本次范围。
2. 在独立分支完成小阶段，验证相关旧功能和新行为。
3. 检查差异中的删除：删除的是重复实现、迁移到新文件的逻辑，还是用户功能；记录替代位置。
4. 提交并推送，PR 给出范围、测试、复用与剩余限制。依赖前一个未合并 PR 时明确标注。
5. 用户决定合并；不默认重写已推送历史、不自动合并主分支。

Git 保存的是源码版本，可以查看或恢复旧代码。真实聊天、人物、记忆与密钥不提交 Git；升级前使用应用内备份保护个人数据。
