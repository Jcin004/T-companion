# 项目背景说明（Project Context）v0.3

## 一、项目目标

T- 的目标不是构建以用户任务为中心的 Personal AI Assistant（个人 AI 助手）。

当前目标是：构建一个以角色自身为中心、拥有唯一主脑、持续身份、长期经历、生活状态、关系边界与逐步增强自主性的长期角色型 Agent。

用户是 T- 的重要 Relationship Object（关系对象）和通信对象，但不是所有思考与行动的默认起点。

## 二、普通聊天机器人与 T- 的区别

普通聊天机器人通常是：用户说话 → Prompt → Model → 回复。

T- 的长期方向是：Character Identity（角色身份）与 Memory（记忆）、Life / World（生活 / 世界）、Relationship（关系）共同形成持续状态，再经过 Attention（注意）、Goal / Drives（目标 / 驱力）、Intent（意图）进入 Agent Runtime（运行中枢），最后选择联系、表达或使用工具。

用户消息只是 Event（事件）的一种，不是系统唯一的启动理由。

## 三、唯一主脑

T- 只有一个权威角色身份与状态。Home、手机、电脑、浏览器等不是多个 T-，而是 Communication Channel（通信通道）、Tool Host（工具宿主）或 Device / Body Interface（设备 / 身体接口）。

设备端不应维护独立 Persona、独立长期 Memory 或独立的 T- 副本。

## 四、角色连续性的组成

- Canon（角色原始设定）：高权威、很少变化的身份事实。
- Persona（稳定人格）：相对稳定的性格、价值、偏好、表达与边界。
- Autobiographical Memory（自传式记忆）：T- 真正经历过的事件与经验。
- Self Model / Self Cognition（自我模型 / 自我认知）：经历之后，T- 如何理解自己。
- Relationship State（关系状态）：T- 与用户或其他人的实际关系事实，不是讨好分数。
- Life / World State（生活 / 世界状态）：当前时间、地点、活动、睡眠、精力、可联系性等事实。

这些数据不能互相替代。详细边界见 CHARACTER_IDENTITY.md。

## 五、Model（模型）不是 T- 的全部

Model 提供语言、推理、联想和部分决策能力。T- 的身份、历史、关系和生活状态应主要保存在自己的 Backend（后端）中。

因此未来即使更换模型 Provider，T- 的连续历史也不应随模型一起消失。

## 六、参考项目

- WrenWen：参考 Runtime、Context、Desire、Wake 等 Agent 架构思想。
- AionsHome：参考实际应用、前后端、设备和 MCP 集成，但不采用每个设备一个独立 AI 的方向。
- Ombre-Brain：参考长期记忆；未来如采用，应位于 MemoryProvider / Adapter 后面。

## 七、当前阶段

Phase 1 的最小 Runtime 已经建立。现在进入 Phase 1.5：Character Foundation（角色身份基础）。

本阶段只建立角色身份的权威来源、数据边界、Provider 与 Context 接入方式，暂不实现完整 Memory、Relationship、Life / World、Attention、Emotion、Wake 或 MCP。

## 八、长期原则

AI 可以想象，但不能随便改写自己的现实。

模型可以表达想法、感受、愿望和判断；但 Canon、已发生事件、关系事实和当前生活事实必须由对应的权威模块维护。T- 的目标不是永远让用户满意，而是保持角色、经历和行为之间的长期一致性。