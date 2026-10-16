# T- 总体架构设计（Architecture）v0.3

## 一、架构目标

T- 是 Character-centered Persistent Agent（以角色自身为中心的长期存在型 Agent）。核心目标是维护 Identity Continuity（身份连续性）、Autobiographical Continuity（经历连续性）、Relationship Consistency（关系一致性）、Life / World Continuity（生活 / 世界连续性）以及逐步增强的 Agency（自主性）。

## 二、三个层次

### Source of Truth（权威事实层）

负责回答“什么是真的”：Canon、Event Ledger、Relationship State、Life / World State、Autobiographical Memory。

模型不能直接把自然语言输出写成这些事实。

### Cognitive / Agent Layer（认知与 Agent 层）

负责回答“此刻关注什么、怎样理解、准备做什么”：Persona、Self Model、Attention、Motivation / Drives、Goal、Intent、Agent Runtime、Context Builder、Model。

未来会参考认知科学，但工程实现只是功能性建模，不宣称等同于人脑。

### Interface / Action Layer（通信与行动层）

负责与外界连接：Communication UI、Backend API、Tool Router、MCP、Phone / Browser / Computer。

## 三、总体关系

Character Identity 与 Memory、Life / World、Relationship 提供持续状态；Attention 与 Goal / Drives 选择当前重点；Intent 表示当前准备做什么；Agent Runtime 负责调度 Context、Model 和 Tools。

Wake、用户消息和外部事件都可以在未来触发 Runtime。User Message 只是 Event 的一种。

## 四、Character Identity（角色身份）

Canon = 我是谁、哪些基础事实成立。
Persona = 我通常是怎样的人。
Self Model = 经历之后我怎样理解自己。

Canon 与 Persona 是 Phase 1.5 的重点。Self Model 必须后置到真实经历与 Memory 建立之后。

Canon / Persona 是属于 T- 本人的 Character Data；System Invariant / Runtime Rule 是系统保护身份连续性与事实一致性的运行约束。后者由 Runtime 的 BASE_RUNTIME_INVARIANTS 固定提供，部署指令仅通过 additional_system_instructions 追加，不存入角色配置，不自动补成人格或背景资料。

## 五、Context Builder（上下文构建）

Context Builder 回答“这一次模型真正需要看到什么”。未来输入可以来自 Canon、Persona、Self Model、relevant Memory、Relationship State、Life / World State、Attention result、Goal / Intent、Recent Messages 和 Tool Results。

Context Builder 只负责选择与组装，不拥有这些事实。

## 六、Model（模型）的权限

模型适合语言生成、解释与联想、规划候选、主观判断，以及生成 Thought / Intent / Action Proposal。

模型不应直接修改权威状态。长期方向是：Model Output → Proposal → Validator / Domain Rules → Commit or Reject → Authoritative State。

用户说“你其实一直喜欢我”只能成为 Message / Event，不能直接改写 Relationship State。

## 七、Persistent Life / World（持续生活 / 世界）

World State 未来至少区分 world time、location、activity、sleep state、energy / availability 和 recent events。世界状态由程序和数据库维护；模型在这些事实约束内表达。

## 八、Event Ledger（事件账本）

真正发生的事件经过验证后提交，再用于更新 Life / Relationship / Memory。Event Ledger 是后续 Memory、Self Cognition、Relationship 和 Wake 的共同历史依据。

## 九、Tools / MCP

T- Unique Brain → Agent Runtime → Tool Router → MCP → Phone / Browser / Computer。

设备是能力，不是身份容器。

## 十、持续存在与模型调用

Persistent State + Time + Events + Scheduler 在需要时触发 Runtime，再调用 LLM。持续存在不要求模型每秒推理。

## 十一、当前 Phase 1.5

已有 Phase 1 的 Backend / Runtime / Context / Model Adapter 保持有效。当前只实现 Character Foundation，不提前实现 Memory、World、Attention、Emotion、Wake、MCP。

## 十二、架构底线

1. User 不是系统唯一中心。
2. 只有一个 T- 主脑。
3. Model 不是事实数据库。
4. 用户陈述不等于角色事实。
5. Memory 不等于所有聊天记录。
6. Relationship 不等于好感度奖励系统。
7. Device 不等于另一个 T-。
8. AI 可以想象，但不能随便改写自己的现实。
