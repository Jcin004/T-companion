# 迁入进度：小邻里生活与通信

唯一活动迁入计划。愿景和约束见 [PROJECT_CORE.md](PROJECT_CORE.md)。基线 e53790a，分支 feat/neighborhood-life-stage1。

## 第一批：地点和规则生活

完成：三地点、原两居民保留、选择第三人、地点改名、每人有限计划校验、移动/活动/占用/中断，按到期点和单日游标补算。复用 A-Life Clock/GOAP/Schedule、T 世界命令与既有寻路。

resident-plans 负责计划和规则执行；resident-life-core 保留原恢复、预算和请求日志，替代模型逐行动轮询。人物和模型连接仍读原模块。

接口：GET /world?location=…；POST /world/setup、/world/commands、/world-life/plan、/retry-plan、/tick、/run。稳定请求标识与回执防止重复执行；UI 不能改写模拟时钟，查询不推进。

## 第二批：通信和知情

完成：SullyOS 原 applyBeatToThreads 私信/群聊，原文不另存于事件；用户消息继续原会话，送达、本人查看、回复选择分开。每个近处听众分别唤醒，观察不授予知情。

world-communication 外部适配稳定回执、实际/模拟时间、同名人物 ID 路由和原线程120条窗口外的同源历史。人物手机把用户原会话投影为联系人，未复制聊天。MemoryModule 继续统一 world_event/原会话来源，无第二套记忆库。

GET /world-phone/:owner 只读，写入被拒绝。world-history 统一活动、现场对话与通信检索，保留来源/保存记忆/联动删除。旧隐藏事件列表收敛到同一记录页。

## 第三批：手机体验与宿主

完成：独立桌面、世界、人物手机、计划、世界设置、记录和衣柜入口，跨模块返回，相机与用户位置分开。人物手机实际保留 SullyOS ThreadBubbles/PhoneModal JSX，由单一 React 挂载模块管理；局部样式不全局接管已有主题。

Android 沿用 QuickJS、WorkManager、SQLite。写入短租约重读/CAS，模型等待释放租约，旧候选拒绝接受。后台规则不要求网络；离线重要决定等待联网。用户主动消息单独记录 user_requests，不消耗自主生活额度；每批同一人的用户消息判断最多一次，离线未发送的决定恢复为待办。初次计划生成失败也立即进入已保存的世界并显示待安排。升级前备份与新状态同事务保存，设置可导出旧备份。浏览器采用同样的事务备份策略。

## 验收证据

- npm test：195 项通过，新增规则零模型、跨地点/补算/重复、占用、私信知情、用户消息无即时回复、不确定请求、保存失败恢复、过期候选、同名路由、120条外历史、现场听众与中断检查。
- Python：103 项通过，警告视为错误。
- tests/neighborhood-browser.mjs：隔离 Chrome，独立入口、相机不移动用户、观察不标已读、长消息、320px窄屏/大字体、衣柜和记录返回。
- NeighborhoodInstrumentation：独立 Android11，原签名0.24合成旧聊天/记忆/衣柜升级。无 Activity/WebView 完成计划、原 SullyOS 私信、SQLite 保存。普通 Worker 推进零请求；重复任务不重复请求；拒绝旧 SQLite 版本；模型等待可并发保存且旧决定失效；升级前备份存在。8次模拟请求包含并发过期测试。
- tests/neighborhood-android.mjs：重启后界面从原生存储读取同一私信；Android11 / WebView83.0.4103.106 实测通过。修正未编译模块逻辑赋值语法的旧 WebView 兼容问题。

本批用显式 OneTimeWorkRequest 检查后台；未等待自然30分钟周期。付费模型、实体手机与真实长期生活感未测试。模拟测试不计为真实服务质量验收。

## 交付与后续

最终构建、源码匹配和原签名升级复核后，发布0.25.0-trial/code38；产品 PR 保持草稿。发布提交、附件与最终结果追加在本文。

后续顺序遵循 PROJECT_CORE；本阶段未完成 float 插件/App、完整 SullyOS 家园演绎或常驻全自主。
