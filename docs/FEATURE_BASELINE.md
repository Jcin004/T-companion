# 已有行为与回归检查

0.14.2：人物、皮肤管理与资源编辑分层；表情、行走和交互独立分页，图集参数折叠。保留旧资源、AI 权限、固定导航和未保存返回保护。回归入口 `wardrobe-browser.mjs` 与原世界浏览器检查，见 [人物衣橱](CHARACTER_WARDROBE_UI.md)。

0.14.1：整合世界呈现与已发布更新修复，使用 versionCode 21，避免 0.13.2 与本地 0.14.0 的编号冲突。原包名、签名、形象、聊天、世界和记忆格式保留；直接清单、续传、暂停、页面进度和匹配源码发布共用原接口。升级验证见 `tests/trial-upgrade-android.mjs`，发布记录见 [更新渠道](UPDATE_CHANNEL.md)。

0.14.0：世界记录覆盖全部场景人物及居民交流，可筛选、搜索、重播语音、删除整轮或居民发言并清理对应来源记忆。人物独立皮肤库、表情分类与方向/站立/动作图配置，AI 仅选择允许的现有资源；前后台规则一致。旧记录、旧图集和无关记忆保留。使用、接口与验证范围见 [世界记录与人物呈现](WORLD_EXPRESSION_HISTORY.md)。

Android 内置 OB：自动为旧卡片建索引；同一事务处理人工/模型写入，保留原文、证据、版本、总结、核心标签和关联。编辑、停用、删除、备份恢复及失败回滚影响后续召回。Android 不调用旧外接网关；网页保留原行为。验证：`tests/embedded-memory.test.mjs`、`tests/test_embedded_ob.py`、`tests/embedded-ob-android.mjs`、`EmbeddedMemoryInstrumentation.java`。迁移细节和平台限制见 `ANDROID_EMBEDDED_MEMORY.md`。

可选 OB 接入：默认关闭；取消时不调用模型；超时/授权/格式失败回退本地；人物/分区响应核对、整条预算与凭据 origin 绑定。普通备份不含口令，恢复后关闭外部查询。验证：`tests/external-memory.test.mjs`、`backend/tests/test_ob_gateway.py`、`scripts/verify-ob-gateway.py`、`tests/external-memory-browser.mjs`。仅本机模式，无自动同步或模型写入。

这份清单用于开发时核对已有行为；不是每轮都重复运行所有设备测试的要求。按改动涉及的功能选择回归，交付写明实际执行的检查。模拟模型、模拟插件和真实设备分别记录。

| 已有功能 | 应保留的行为 | 现有验证入口 |
|---|---|---|
| 人设名册、联系人 | 人物资料经名册编辑；同一人物重复发起聊天复用联系人；人物记录相互隔离 | `tests/local-service.test.mjs`、`backend/tests/test_companion.py` |
| 身份与运行约束 | Canon/Persona 与程序约束分开；未知资料不补写；元数据不进入身份提示词 | `backend/tests/test_character_provider.py`、`backend/tests/test_runtime.py`、`backend/tests/test_client_rules.py` |
| 模型配置 | 多连接、分组、独立密钥与切换；App 内可拖动悬浮球复用选择弹窗；切换不改变已指定的记忆连接；更换域名不能悄悄复用旧密钥 | `tests/preferences.test.mjs`、`tests/preferences-browser.mjs`、`tests/api-floating-browser.mjs`、`tests/memory.test.mjs` |
| 聊天 | 流式展示、失败保留、取消、同请求标识重试不重复创建；首次保存失败不调用模型 | `tests/local-service.test.mjs`、`tests/local-transactions.test.mjs` |
| 聊天风格、外观 | 分条、动作/表情/语音表达开关；可编辑每聊天动作模板、占位符、线上私聊默认值；旧请求重试保持原策略；外观独立 App | `tests/preferences.test.mjs`、`tests/preferences-browser.mjs`、`tests/chat-editing-browser.mjs` |
| 文字操作 | 桌面消息右键复制/选择；输入框剪切/粘贴/全选；剪贴板失败明确提示；Android 长按由系统处理 | `tests/chat-editing-browser.mjs` |
| 历史记录 | 游标加载、搜索、日历跳转、滚动位置；同时间戳稳定排序 | `tests/local-service.test.mjs`、`tests/desktop.mjs` |
| 草稿与备份 | 草稿与回复交错不丢失；恢复先校验，失败保留原文档；普通备份不含密钥和日志 | `tests/local-transactions.test.mjs`、`tests/local-transactions-browser.mjs` |
| 上下文条数 | 全局与单聊天可设 0–2000；继承设置；可直接输入，输入自动切为此聊天独立设置；已完成消息才进入历史 | `tests/context-policy.test.mjs`、`tests/context-browser.mjs`、`backend/tests/test_context_limits.py` |
| 来源记忆 | 逐字证据；人物隔离；参与关联不自动共享；停用/删除影响召回；保存失败不推进水位 | `tests/memory.test.mjs`、`tests/local-transactions.test.mjs` |
| 记忆网召回 | 同人物近期线索与单跳关联；人工标签及来源；过期节点排除；条数/完整材料预算；预览和日志一致 | `tests/memory-recall.test.mjs`、`tests/memory-recall-browser.mjs` |
| 记忆关联、标签依据 | 有向关系与人物隔离；端点变更提示复核；失败不泄漏；重分析保留已关联标签 | `tests/memory-links.test.mjs`、`tests/memory-links-browser.mjs` |
| 每日总结、自我标签 | 按时区定位原文；总结编辑/重写保留十版；人工核心标签不被分析覆盖；不改写名册 | `tests/memory.test.mjs`、`tests/memory-browser.mjs` |
| 来源定位、查询 | 旧消息仍能定位；校验来源人物及完成状态；预览不调用模型、不保存草稿、不读取密钥 | `tests/local-queries.test.mjs`、`tests/memory-browser.mjs` |
| 日志 | 请求上下文与实际发送一致；密钥脱敏；关闭上下文记录、导出/清理和刷新有效 | `tests/diagnostics.test.mjs`、`tests/diagnostics-browser.mjs` |
| 既有复用模块 | SSE 保留空白；JSON 修复仍验证证据；BM25 保持来源匹配和人物隔离；供应商文件匹配固定版本 | `tests/sse.test.mjs`、`tests/reuse-optimization.test.mjs` |
| Android | 本机 SQLite、独立凭据、原生模型请求、返回与文件操作保留；构建通过只说明可构建 | `.github/workflows/tests.yml`、`tests/memory-android.mjs` |
| 源码与更新 | 源码按明确提交导出；可配置 HTTPS 清单与静态备用；失败日志含阶段/域名；保留签名/包名/版本/哈希校验；未发布渠道不宣称已有下载 | `backend/tests/test_source_export.py`、`tests/app-update-browser.mjs` |

完整功能开关和平台差异以 [当前架构](CURRENT_ARCHITECTURE.md) 为准。设备感知、完整记忆网、后台自主生活、跨设备同步仍未实现。

## 每次怎样保留进度

1. 开始前检查分支和未提交修改，选定本次范围。
2. 在独立分支完成小阶段，验证相关旧功能和新行为。
3. 检查差异中的删除：删除的是重复实现、迁移到新文件的逻辑，还是用户功能；记录替代位置。
4. 提交并推送，PR 给出范围、测试、复用与剩余限制。依赖前一个未合并 PR 时明确标注。
5. 用户决定合并；不默认重写已推送历史、不自动合并主分支。

Git 保存的是源码版本，可以查看或恢复旧代码。真实聊天、人物、记忆与密钥不提交 Git；升级前使用应用内备份保护个人数据。

聊天详情子页（风格、历史、名册）返回时恢复上一级，保留详情表单草稿；跳转来源或返回桌面不重新弹出父页。回归入口：`tests/chat-settings-browser.mjs`。

AI 关联候选不参与召回；显式选材、两端原话、确认/拒绝、版本失效和失败回滚必须保留。确认不覆盖已有人工关系，删除候选不删正式关联。回归入口：`tests/memory-link-proposals.test.mjs`、`tests/memory-link-proposals-browser.mjs`。

## 0.11.0 最小世界

本机桌面新增世界入口，保留原有各 App。世界状态、位置、事件、实际知情记录同事务保存，操作重试去重；场景会话与线上历史分开，未完成回复不成为世界经历。记忆新增明确 world_event 来源，不伪造聊天；原聊天证据、记忆管理、关联、预算和 Android 内置 OB 均保留。验收入口：`tests/world.test.mjs`、`tests/world-browser.mjs`、`tests/world-android.mjs`。使用与限制见 [最小世界](MINIMAL_PIXEL_WORLD.md)。

## 0.12.0 居民活动与主动消息

保留原世界与聊天。两位居民独立上下文、合法移动/交互与定向交流；自主经历整理用原 MemoryModule 验证和 OB；主动消息是带事件来源的角色消息，无伪造用户轮次。未读保存到会话游标，原聊天失败重试保留。原生前后台共用 QuickJS 规则包、SQLite CAS/租约与 OB 锁；WorkManager 管网络/电量约束，安静时段/额度由规则管理。任务预留、响应和接受分开保存；不确定请求明确跳过，已返回结果保存失败可无额外模型调用恢复。回归入口：resident-life.test.mjs、resident-life-browser.mjs、ResidentLifeInstrumentation.java；实际平台验收见 RESIDENT_LIFE.md。

## 0.12.1 世界摇杆

房间左下新增触屏摇杆：拖住持续移动，按主方向走相邻一格，松手、取消触摸、离开世界或应用进入后台时停止。仍可点击地板、人物和地点，移动对象选择保留。碰撞不产生事件；实际走完的一格通过原世界命令和事务保存，失败停止，原请求标识可重试。地图、美术、事件与知情范围、手动记忆和居民生活均保留。回归入口：`world-joystick.test.mjs`、`world-joystick-browser.mjs`、`world-browser.mjs`、`world-joystick-android.mjs`。操作和交付记录见 [世界摇杆](WORLD_JOYSTICK.md)。

## 0.13.0 世界画面与场景对话

房间换用有来源记录的像素素材，保留原网格、位置、事件和摇杆；人物有四方向步态与可保存朝向。底部立绘对话保留流式回复、失败重试、上下文预览和历史加载，新增台词翻页、已保存回复的 TTS 回放与历史泡泡，不重复请求模型或保存事件。人物形象与身份分开，支持多立绘切换和四方向图集导入预览。

同房间在场名单与附近/听众分别提供；完成的场景回复可提出有限地点交互，程序校验、移动并保存带原对话来源的事件。常驻家具按钮改为靠近出现的操作，点击物品可先走近；世界记录、居民生活和世界设置迁到右上头像九宫格，原入口能力保留。详见 [世界画面与对话](WORLD_VISUAL_DIALOGUE.md)。

## 0.13.1 人物图片与站立步态

同一人物下分别上传立绘与像素小人，固定人物选择/关闭/保存，防止异步上传串入另一人物。预览有站立/行走开关和四帧顺序；小人停止用第一帧，步态按行进距离连续播放，修复保存后先跳到终点再倒回的问题。原图集、摇杆、碰撞、对话、事件与存档保持可用。回归入口：`world-motion-browser.mjs`、`world-motion-android.mjs` 及原视觉/摇杆脚本；旧 WebView 显式固定弹窗位置并查看原生截图。

0.13.2 更新器保留原签名/包名/版本/哈希校验、权限引导和手动下载；清单优先直接读取，下载支持部分文件恢复和暂停，切换设置页不重复发起任务。回归见 `tests/app-update-browser.mjs`、`UpdateTransferInstrumentation.java` 和 `UpdateChannelInstrumentation.java`；发布状态与复用见 [更新渠道](UPDATE_CHANNEL.md)。
