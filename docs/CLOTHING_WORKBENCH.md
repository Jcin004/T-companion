# 像素衣服绘画台：第一阶段

0.19.0，2026-10-31。基于已发布的 0.18.3，分支 `feat/pixel-clothing-workbench`；不合并 main。

## 使用

世界 → 头像菜单 → 人物 → 某个人物的衣橱 → 添加皮肤。填写名称，选择“在素体上画衣服”。上传图片的旧流程保留。手绘创建独立皮肤，不替换已有上传图或当前穿着，默认不允许 AI 使用。

绘画台提供固定 64×96 素体、四方向 × 三姿势。标准身高 80 像素，脚底中心 (32,88)，世界身高比例沿用房间宽度 20%。原始几何由项目绘制，未打包私人参考截图或游戏美术；正面参照已由用户认可，其余方向/迈腿是本轮试作。

- 画笔、橡皮按固定原点的方格工作，单位 1、2、4 个原图像素。快速拖动补齐格子，切换单位不重采样已有图。
- 放大的是画布视图，不改变像素或衣服大小。双指缩放/移动、单指“移动画布”、加减和适合窗口共用同一个视图；滚轮不修改数值。
- 素体锁定，衣服为透明层；擦除露出素体。支持 Piskel 连通填色、取衣服层颜色、15 色调色板、镜像画笔、网格和站立叠影。更改一枚色卡会改变全部姿势中使用该颜色的像素，支持撤销。
- 每次完整笔画作为一个撤销步骤，保留最多 40 步。指针取消、第二根手指加入缩放时取消未完成笔画。
- 选择朝向及迈腿 A / 站立 / 迈腿 B，分别编辑；预览按站立 → A → 站立 → B 播放。
- 完成笔画后自动保存草稿。关闭会等待保存，失败留在绘画台并提供重试；重新打开或重启后可继续。强杀发生在保存完成前时，未确认保存的笔画不保证保留。
- “应用到这套皮肤”才把工程合成行走图集；保存后仍保留可编辑层。回衣橱点“使用”才切换当前穿着。关闭/保存固定在窗口边缘。

当前是一套素体上的逐帧衣服层。没有头发、上衣、鞋等独立装备槽，没有任意 PNG 自动适配动作，没有一幅图自动映射到全部姿势。浇水等物品动作仍沿用原动作系统；后续按模板补齐。

## 架构与保存

| 位置 | 职责 |
|---|---|
| `clothing-template.js` | 原创整数像素素体、方向/姿势、共同尺寸/脚底、初始背心及调色板 |
| `clothing-project.js` | 工程结构/版本/大小校验，保存与应用的版本冲突和重复提交规则；无 DOM，前后台可加载 |
| `pixel-paint.js` | 固定网格绘制、笔画取消、有限撤销/重做、Piskel Frame 适配，不保存数据 |
| `clothing-render.js` | 从锁定素体和衣服像素生成 Canvas 预览、原世界格式的 PNG 图集；结果可重建 |
| `clothing-workbench-ui.js` | 固定人物/皮肤的编辑会话、触屏输入、单个保存队列、错误/重试、退出清理 |
| `CharacterLooksModule` | 校验人物/皮肤归属，经原 `LocalService.transact` 保存，不新增人物或资源数据库 |

原皮肤可选增加 `drawing = {version:1, revision, project?, draft?}`。工程包含 `version:1`、固定 `template_id:t-body-64x96-v1`、16 色（0 透明）与 12 个 6144 字符的十六进制像素层。体型及姿势定义由固定版本代码拥有，用户修改颜色/衣服像素。原图集 PNG 仍走现有 SQLite 图片去重。

接口：`/character-looks/{owner}/drawing/{skinId}`。GET 返回该皮肤绘画状态；PATCH 接受 `{expected_revision,project}` 保存草稿；POST 接受 `{expected_revision,project,sprite}` 将工程和图集同事务应用。保存失败不发布候选，版本不符拒绝覆盖，同一内容的重试不增加版本。其他皮肤、当前穿着、表情和人物身份不变。

草稿与已应用工程随原备份往返；旧皮肤没有新字段仍可读。`lookFor/looksFor` 向世界返回呈现字段，排除绘画工程。Android 仍用原 TLocal SQLite 文档/图片表及 CAS/租约；浏览器沿用 IndexedDB。本机功能，未扩展可选 FastAPI 共同后端。

退出暂停预览、撤销未完成触摸并等待已完成笔画落盘。应用时锁定编辑控件，防止生成图集和保存工程之间再修改；草稿不进入世界事实或模型上下文。后台只能按原允许列表选择已保存皮肤。

## 复用与许可

实际导入 Piskel 固定提交 `d828941fa9fe76464d69d91d5fd862067c98c02c` 中 `PixelUtils.js` 的两段原样函数：连通填色和相邻像素遍历。Apache-2.0，Copyright 2017 Julian Descottes and contributors。原样片段、完整许可、原文件 blob、片段行号和 SHA-256 在 `frontend/vendor/piskel/`；构建脚本校验后生成外部 ES-module 包装，整数边界 Frame 由本项目提供。未导入其另有外部来源的画线算法。

Piskel 应用的工具/历史/界面依赖控制器，不能直接承担本项目手机编辑和 SQLite；故仅复用算法。LPC、FashionSense、Outfit Studio 继续作为分层、动作映射和穿搭界面参考，当前没有导入其美术或服装引擎。逐文件清单见 `config/outfit-workshop-sources.json`，声明见 `THIRD_PARTY_NOTICES.md`。

## 验证入口

`npm test`、Python 仓库检查，以及 `tests/clothing-workbench-browser.mjs`。后者在隔离 IndexedDB 用鼠标、触屏及双指输入验证整格、快速笔画、擦除/填色/镜像、取消、失败重试、逐帧隔离、重启、可编辑工程与合成像素一致。

`tests/clothing-workbench-android.mjs` 仅允许已有合成人物的专用模拟器；先 `--capture` 保存 0.18.3 业务/密文凭据指纹，再原签名覆盖安装 code30。通过原生触摸和系统截图检查画图、撤销、独立姿势、SQLite 重启、应用与世界穿着，结束恢复完整合成业务快照。

## 0.19.0 验收（2026-10-31）

- 代码提交 `3f2487f84fcdc8f1467b42714d41a69d6e3b076f`；原包名 `io.jcin.tcompanion`，versionCode 30。
- APK 为 `T-companion-0.19.0-trial.apk`，80,146,448 字节，SHA-256 `c5799255b8f48e31a310a0d39df1f740005aac331f32aba956f77c09401a5687`。原签名证书 SHA-256 `bbe3e752f8e004461e01225a439a3961e4a07783b328eeca6c0c962ff3cb8c5b`；源码归档 SHA-256 `cf1e74f11c3e83c17c5952d4df9b81136dd94c0f778c80ffa2f9fb8beecda45c`。
- 147 项 Node、103 项 Python 检查通过。绘画台、衣橱、单格上传、校准、单帧位置隔离、世界对话、移动和图片档案共 8 条浏览器流程通过；均使用隔离数据和模拟模型。
- Android 11 / WebView 83 专用模拟器使用原生点击、滑动和系统截图验证整格画笔、撤销/重做、独立姿势、草稿在 SQLite 重启后恢复、应用图集和房间穿着。先从 0.18.3（29）覆盖安装首个 0.19.0（30），再覆盖安装修正窗口定位的最终 0.19.0；每次与同一份原始合成业务及密文凭据指纹核对。测试结束恢复合成存档。
- 原生截图发现首版绘画窗口偏下，最终版显式固定窗口位置；关闭和应用按钮在内容滚到顶部、底部后都位于视口内。截图保存在本机 `artifacts/clothing-native-workbench.png`、`clothing-native-scrolled.png` 和 `clothing-native-world.png`。
- 原更新页面在旧 WebView 的共享任务、进度及安装权限返回回归通过。源码快照 529 份 blob 扫描未检出密钥或隐私阻断；Piskel 原样片段和构建包装通过哈希验证。
- [GitHub CI](https://github.com/Jcin004/T-companion/actions/runs/41108708832) 的 Python/Node、完整可达历史密钥扫描和 Android 应用/原生测试 APK 构建通过。
- 未进行实体手机及真实模型服务测试。素体四方向/迈腿仍为试作；动作自动映射、分部件组合换装继续按阶段 5、6 实施。

草稿 PR：[人物衣服绘画台 #33](https://github.com/Jcin004/T-companion/pull/33)，未合并。已发布 [0.19.0 试用版](https://github.com/Jcin004/T-companion-updates/releases/tag/android-v0.19.0)：APK、源码、许可证、第三方声明、构建说明、清单及校验和共 7 个附件；匿名 API 可读，APK/源码摘要与本机一致，默认 raw 清单与发布清单一致。

发布后的 Android 原生默认渠道检查两次失败：最终记录为 raw 清单 DNS 失败、GitHub API 超时，页面如实显示未完成检查。主机可读 raw 清单与公开附件；当前网络下的模拟器未完成在线更新验证，真机网络未测。可从 Release 下载原签名 APK 覆盖安装，不要卸载旧版。
