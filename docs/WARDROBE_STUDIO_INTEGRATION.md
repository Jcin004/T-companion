# 独立制作页与开源模块接入（0.24.0）

世界 → 头像 → 衣柜。试穿、公共原版制作、人物本体编辑现在是三个独立上下文。旧版同一长表单上的制作区已删除，人物/类别/朝向不再交叉绑定。

## 使用

衣柜保留镜子、穿戴格、公共衣物、整套搭配和人物适配；只有这里提供应用到世界。

「衣物制作」打开独立素材库，只有头发、帽子、配饰、上衣、下装、鞋子六类。新建或点某一件进入具体原版，顶部固定显示类别和名称。四方向用图片卡片呈现；点卡片后上传或绘画。上传先存草稿，底部「保存原版」才替换原版。复制/删除收进「更多」，没有选中素材时不出现空编辑按钮。

「编辑人物本体」单独选择、上传或绘制本体，调整当前人物身高并选用。本体原版可共用，需要独立样子时另存再选用；不把共用本体自动改成单人的另一份。名字与未保存的遮挡调整离开前提示；绘画/上传草稿保留，下一次可恢复。

绘画页三姿势按钮显示实际缩略图，选择迈步后可「复制站立到此帧」，操作纳入现有撤销/重做和草稿事务，不影响其他姿势。没有新增第二套方向选择。

## 三个项目的实际接入

- **LPC**：固定 `86160e7507d6841259cff624a51a63c1d4847ee3`，`sources/canvas/draw-frames.ts` 的 `drawFrameToFrame` 原样片段。`scripts/build-outfit-tools.mjs` 校验字节后编译；`outfit-frame-copy.js` 将 64×96/128×192 矩形按等大方块搬入图集，尺寸不变形。衣柜应用到世界已经通过此入口导出全部姿势。
- **Fashion Sense**：固定 `39e9e9e13c9f9a78416172e73a229cf8703ddb59`，`LayerManager.cs` 原样留档，`outfit-layer-order.js` 把相对移除/插入/追加规则移植为 JS。这里只开放逐方向默认、身体后方、最前方；不带入 SMAPI/XNA/游戏运行时或其他条件。镜子和世界图集共用同一顺序。复杂头发分前后层、宽袖、长裙与额外交互动作仍需专门适配。
- **Piskel**：已有 Apache-2.0 connected-fill 原样片段继续运行，不更换稳定核心。另检查 `32252c3a1305608911622bc40a67bb636b18fae1` 的 frame model/frame-list 后调整逐帧呈现与显式复制；新增 UI 和撤销使用 T- 既有 PaintSession。没有把 Piskel 桌面应用整体嵌入手机。

完整来源、提交、逐文件 Git blob、SHA-256、依赖与改动见 `config/wardrobe-studio-sources.json`。原有 Piskel 审计见 `config/outfit-workshop-sources.json`。GPL 源码/片段和完整许可证分别保留在 `frontend/vendor/lpc/`、`frontend/vendor/fashion-sense/`；Piskel Apache 许可不变。应用许可页与第三方声明同步；未导入 LPC、星露谷或截图美术。

## 架构与保存

`outfit-wardrobe-ui.js` 只拥有试穿；`outfit-studio-ui.js` 拥有原版素材库/具体编辑上下文，两者通过 getCatalog/save 共享同一已保存目录，但不共享选中状态。绘画台仍是原模块，独立 DOM ID 区分原版绘画与个人适配绘画。

原 `/character-looks/user/workshop`、`workshop-apply`、CharacterLooksModule、事务、SQLite CAS/租约和备份保持唯一写入路径。新可选素材字段 `draw_order` 是四方向的 default/behind/front；旧目录缺省保持原层序。历史原版携带原遮挡值；更新原版也会为已有穿戴者固定旧版，已有人物适配不被改变。新备份需要 0.24.0 或以后版本读取。

无界面宿主只做目录校验，不加载 Canvas。平台仍是本机浏览器和 Android，Python 共同后端未新增衣柜 API。

## 验证

`wardrobe-reuse.test.mjs` 验证上游字节、许可证、LPC 两种分辨率无拉伸、分方向稳定排序；`outfit-catalog.test.mjs` 追加旧版遮挡固定及备份校验。`outfit-studio-browser.mjs` 验证类别隔离、上传草稿/保存、逐帧复制撤销、本体身高、实际 Canvas 遮挡像素与导出、重载。原衣柜、镜子人物隔离、绘画台和手势浏览器流程保留。

## 0.24.0 交付（2026-11-03）

- 功能提交 `a5d5f4e`；跨平台原样字节修正 `449c249`；发布源码 `0406768d1e70962935a9d8da4687bd749db2322e` 修正新建素材后在控件恢复可用时聚焦名称，Android 原生键盘可正常输入。
- 分支 `feat/wardrobe-studio-reuse`，[草稿 PR #41](https://github.com/Jcin004/T-companion/pull/41)，基于 `feat/shared-mirror-wardrobe`，未合并。
- 原包名 `io.jcin.tcompanion`、原签名，versionCode 37。APK `artifacts/T-companion-0.24.0-trial.apk`，81488627 bytes，SHA-256 `5a4df3523098e13e90ee7883a17f13e075f71f86502255cab6174552f04ebfcc`。精确源码 `artifacts/T-companion-0.24.0-source.zip`。
- [公开 APK、源码及许可](https://github.com/Jcin004/T-companion-updates/releases/tag/android-v0.24.0) 已发布；七附件摘要与本机一致，匿名 API 读取 main 更新清单与发布清单一致。本机 raw 主机仍连接重置，未把它记为可达；设备自动检查更新网络本版未测。
- 186 Node、103 Python，通过独立制作页、原衣柜、镜子人物隔离、原绘画台和导航手势共五套浏览器流程；格式与范围密钥扫描通过。[发布源码 CI](https://github.com/Jcin004/T-companion/actions/runs/41476192802) 全部通过。
- Android 11 / WebView 83 专用模拟器：原签名 0.23.0/code36 → 0.24.0/code37 覆盖保留完整合成业务文档、加密凭据指纹；原生新建、键盘输入名称、原版绘画保存、本体页面隔离、个人绘画适配、套装、脱下再穿、世界应用、SQLite 重启通过。原生截图 `artifacts/studio-native-source.png`、`studio-native-wardrobe.png`、`studio-native-world.png` 已检查。测试后恢复原合成存档。
- 没有付费模型请求；没有实体手机验证。复杂衣物版型遮挡、额外交互动作映射和自动骨骼绑定仍不在此版完成范围。

体验：覆盖安装 → 世界 → 头像 → 衣柜。挑衣服在衣柜；创建或修改公共原版点「衣物制作」；修改身体点「编辑人物本体」。原版保存不等于穿上，回衣柜确认并应用到世界。

