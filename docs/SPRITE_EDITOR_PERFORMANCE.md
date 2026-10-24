# 形象编辑与行走性能 · 0.18.2

基线 `333834e8b082c2b1a9e9f89c48eaeca7fd21f3e2`，实现日期 2026-10-25。包名和试用签名不变，versionCode 28。

## 当前操作

世界 → 头像 → 人物 → 皮肤 → 站立行走。上方四方向格子同时负责选方向、姿势和上传目标；选一格后上传单张透明 PNG。表情和交互动作继续使用各自分页。

移除第二个方向下拉、重复图集模板、三个放大按钮、整组/单帧模式切换按钮。调整大小与落地使用固定参照、整组拖动和“数字 / 减 / 加”；输入框上的滚轮转为滚动所在页面，不修改大小或位置。双指仍可放大编辑视图，还原视图只在放大后出现。房间试穿默认关闭，展开才绘制。单格源图可编辑时才提供“微调选中姿势”，开关决定拖动这一格还是整组。

“导入整张图”单独打开窗口，只有这一处选择布局。三列四行、旧四列、单行动作直接配置；自定义布局才显示行数、方向行号、站立帧和播放顺序。保留非标准旧图集的编辑能力，主页面不再重复这些参数。替换整图保留原有清除单格记录的确认。固定返回、关闭、保存和人物/皮肤归属不变。

## 卡顿原因与改动位置

- `json-snapshot.js` 为 JSON 容器创建独立副本，复用不可变的图片字符串；替换服务/世界/形象中的 JSON 字符串往返克隆。`looksFor` 一次验证后取得可见人物当前皮肤，不逐个复制所有闲置皮肤；仍检查无效旧皮肤。
- `character-atlas-ui.js` 按图片和帧布局复用缩略图 DOM/Canvas。校准大小和选择姿势不重建全部格子。`character-calibration-ui.js` 延迟房间绘制；`world-art.js` 复用默认头像 PNG；弹窗不再模糊背后的房间。
- `native-look-images.js`/`NativePersistence` 与原 `TLookAssets` 共用图片字段。已有 SQLite 图片资源按 SHA-256 传引用，首次逐张校验/载入，新图只发送一次；业务与备份仍使用完整图片。没有另一份图片数据库或 schema 升级。
- `TLocalPlugin.save` 原用 Capacitor `getLong` 取 revision；它只接受 Long，较小 JSON 数值实际是 Integer，会误走缺版本分支。这个分支原本解码全部图片，并用最新版本替换调用者版本。现在接受非负安全整数，拒绝显式过期版本；旧的缺版本调用只读元数据。设备测试确认 stale/fraction 请求均拒绝且不改文档。
- 租约开始时顺带返回元数据快照；成功保存顺带释放租约。`TDocumentStore` 每个数据库连接只初始化一次辅助表。CAS、租约、文档和图片原子提交仍由同一 SQLite 入口负责；失败不发布新 revision。
- 世界命令可用 `?view=world` 返回本次提交后的显示投影，页面无需另做一次原生读取。默认命令响应和请求去重不变。摇杆仍每次只接受一个持久步骤，与 200ms 的相邻格动画并行；不在保存完成前排队执行下一步，失败恢复已存位置。

编辑器拥有临时草稿；人物形象模块验证并经原事务保存。世界拥有位置和完成事件。图片引用是原生传输适配，领域对象、模型上下文、记忆、人物 Canon/Persona 均不改格式。无界面居民宿主仍使用同套世界规则，未选择引用协议的原生调用保持旧读取方式。

## 实际参考了什么

逐文件版本、blob、许可和适配见 `config/sprite-editor-sources.json`，沿用已有来源审阅。

| 项目 | 已查文件 | 本次采用 / 未导入 |
|---|---|---|
| [Piskel](https://github.com/piskelapp/piskel/blob/d828941fa9fe76464d69d91d5fd862067c98c02c/src/js/rendering/OnionSkinRenderer.js)，Apache-2.0 | 固定提交的 `OnionSkinRenderer.js`：比较计算哈希，变化后清理/合并/绘制 | 采用“内容没变就复用”的策略于现有缩略图；未搬入依赖 pskl 控制器的整个编辑器，没有复制源码或素材 |
| [Alicization Town](https://github.com/Jcin004/Alicization-Town/blob/1a33ba65d0af2134b369b1eb4eb68f45d2c817c4/server/web/js/game.js)，根许可 AGPL-3.0-or-later | `gameLoop`/`updatePhysics` 的 rAF、显示/目标位置、停步帧 | 继续沿用已适配的显示与状态分离；本轮修存储步骤开销。上游按帧速度不能直接替代已有按时间动画，也未带入 Node 世界服务器、人物和美术 |

本次无第三方运行代码/素材导入，无新运行依赖。私人参考截图不打包。

## 验证记录

141 项 Node、103 项 Python（warnings as errors）通过。浏览器合成数据覆盖衣橱、表情/全局记录、单格上传、固定参照、移动、图片档案；无模型请求。新增回归覆盖 JSON 副本隔离、闲置皮肤校验、图片引用/备份兼容、保存失败重试和已提交世界投影。

专用 Android 11 / WebView 83 模拟器，实际 SQLite、原生触屏与 screencap：

| 检查 | 实测结果 |
|---|---|
| 合成大图片存档 | 逻辑文档 12,157,721 字符，27 处图片引用；首次只载入 1 张去重图片 |
| 重复写入 | 4 次移动及初始化共 5 次保存；最大元数据 10,921 字符，未变图片发送 0 字符（5 个空字典合计 10 字符） |
| 世界读取 / 移动服务调用 | 4 次读取 8～12ms，4 次移动 11～20ms；不含摇杆动画 |
| 持续摇杆 | 原生 DOWN/MOVE/保持/UP，62 个人物绘制样本；帧间隔 p95 32ms、最大 105ms。中间诊断版本曾有 150～190ms 步间停顿；当前命令均在 200ms 步动画内完成 |
| 点击选格 / 展开房间 | 从真实 click 到后续两次 rAF 为 29ms / 25ms；这是浏览器帧回调测量，不是 GPU 呈现时间 |
| 事务/版本 | 错误图片哈希、过期 revision、小数 revision 拒绝，原文档与 revision 保留 |
| 覆盖与恢复 | 原签名 27→28，完整业务存档与加密凭据指纹一致；整组/单帧原生拖动、重启、房间人物可见，Piskel/LPC 离线试验仍通过 |

本地证据位于忽略的 `artifacts/editor-native-perf-28.json`、`editor-performance-native.png`、`calibration-native-editor.png`、`calibration-native-room-preview.png`。噪声 PNG、红块等为合成测试素材，不作为美术效果展示。测试结束恢复完整合成存档。模拟器与桌面共用宿主，偶发长帧仍存在；没有真机帧率或真实模型服务验收。

原生压力回归入口：`tests/sprite-editor-performance-android.mjs`。主动要求专用模拟器与指定合成人物，拒绝其它存档。更新 APK 与匹配源码随本版发布，最终提交及下载见 PR 与试用渠道。

## 后续绘画约定

尚未新增绘画功能。按用户确认，画笔是吸附固定网格的整格填色，支持改变逻辑单位和辅助线；画布放大与格子单位分别控制，详见 `OUTFIT_WORKSHOP_PLAN.md`。先完成母版四方向与姿势，再实现衣服独立图层和逐笔撤销。


## 正式交付

- 源码/构建提交：`6cd8cea7f1379a615be9e04e13235d9d60bcfcf6`，分支 `fix/sprite-editor-performance`，草稿 [PR #31](https://github.com/Jcin004/T-companion/pull/31)，基于 `feat/fixed-sprite-reference`，不合并 main。
- [0.18.2 试用下载](https://github.com/Jcin004/T-companion-updates/releases/tag/android-v0.18.2)：原包名、原签名，versionCode 28。APK 80,153,563 字节，SHA-256 `664392206de0210f5f26d35832cc5c06a63dcefdccb8fa020a2c16b893dafe30`。
- 匹配 `git archive` 源码 11,824,997 字节，SHA-256 `9fa67ae5fda2c69b24d1a70c1b910d30e0691bd3bcd22266053bd2a6c1b2e460`。APK 内 source-commit 与所有 frontend 文件逐项匹配此提交；七份发布附件包含源码、许可和校验清单，静态更新清单同步推进。
- 最终签名 APK 再次覆盖安装并运行原生校准/压力测试：64 个绘制样本，帧间隔 p95 29ms、最大 110ms；移动服务 12～20ms；点击到后续两帧 18/21ms。与上表前一次同规则测试的波动分开记录，不当作稳定真机帧率。
- 原存档与加密凭据完整指纹仍与 code27 升级前一致；最终 APK 源码标记核对通过。仅专用合成模拟器，不读取真实聊天或模型密钥值。
- 141 Node、103 Python、六组浏览器、原生覆盖/触屏/重启和来源/密钥扫描通过；[GitHub Actions](https://github.com/Jcin004/T-companion/actions/runs/40127442472) 成功。快照扫描 511 个 blob，无密钥/隐私阻断。
- 安装后从世界 → 头像 → 人物 → 皮肤 → 站立行走体验；可以直接覆盖旧版，保留应用数据。未验证真机与真实模型；本轮未重新验收 Android 原生网络的更新检查/下载，不把桌面渠道可达当作手机网络验证。

本地 APK：`artifacts/T-companion-0.18.2-trial.apk`；匹配源码：`artifacts/T-companion-0.18.2-source.zip`。本文件后续交付记录提交与 APK 构建提交区分，APK 不冒用文档提交作为构建源码。
