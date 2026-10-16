# 角色身份设计（Character Identity）v0.1

## 一、目的

本文档回答一个核心问题：T- 的“我是谁”到底由哪些不同类型的数据组成，以及谁有权修改它们。

角色身份不能全部塞进一个 Persona Prompt，否则模型很容易把用户陈述、临时情绪、过去经历和原始设定混成一团。

Character Data（角色数据）回答“他是谁、他通常是怎样的人”；System Invariant / Runtime Rule（系统不变量 / 运行规则）回答“系统如何保护他的身份不被模型或用户随意改写”。两者是不同层次。

Canon / Persona 只保存属于 T- 本人的已明确资料。`fixed_boundaries` 是角色身份事实中的固定边界；`boundaries` 和 `behavioral_tendencies` 是角色本人的稳定边界和倾向，不能用通用工程规则填充。Phase 1.5 尚未提供真实梦角资料，相关列表保持为空，`UNSPECIFIED` 保持未知。

保护 Canon / Persona 不被用户陈述自动改写、不补写未知事实、不虚构未发生的行动或事件、不为迎合用户伪造感受、允许拒绝和表达不知道，以及不把未确定的身份、经历或感受说成既定事实，属于运行规则。它们由 `backend/app/agent_runtime/runtime.py` 中的 `BASE_RUNTIME_INVARIANTS` 固定提供，不写回角色 YAML，也不硬编码角色姓名。

本阶段通过不可变 CharacterProfile 和只读投影维护代码层的写权限边界；System Instructions 约束模型表达，不构成新的角色事实或模型行为保证。部署附加指令由 Settings.additional_system_instructions / ADDITIONAL_SYSTEM_INSTRUCTIONS 追加，不能替代基础规则；旧 SYSTEM_INSTRUCTIONS 覆盖路径停止使用，不新增 Policy Engine。

## 二、六类必须分开的信息

### 1. Canon（角色原始设定 / 身份事实）

表示高权威、很少变化的基础事实，例如姓名、身份、背景、世界观中的固定事实、已确定的重要前史、明确的关系前提与不可随意覆盖的设定。

普通聊天和模型输出没有直接写权限。

### 2. Persona（稳定人格）

表示相对稳定的 personality、values、preferences、communication style、boundaries 和 habitual tendencies。

Persona 可以长期演化，但不能因为一次聊天立即被覆盖。

### 3. Self Model / Self Cognition（自我模型 / 自我认知）

表示经历之后 T- 如何理解自己。它必须有 Memory、Event 或 Reflection 的依据，不能直接把用户对 T- 的评价写成自我事实。

### 4. Autobiographical Memory（自传式记忆）

记录 T- 自己真正经历过的事件和经验。Message 不自动等于 Memory；用户说某件事发生过，也不自动证明它发生过。

### 5. Relationship State（关系状态）

记录 T- 与用户或其他人的实际关系。它不是好感度奖励系统，也不能由“用户希望是什么关系”直接改写。

用户的表白可以成为 Event 和 Memory，但不能自动产生 reciprocal romantic interest（相互恋爱情感）。

### 6. Life / World State（生活 / 世界状态）

表示此刻的时间、地点、活动、睡眠、精力、可联系性等事实。它应由 World / Life 模块维护，而不是由模型在回复时临场发明。

## 三、权威等级

建议理解为：

Canon（最高稳定事实）
→ Event Ledger / World / Relationship（已经成立的现实事实）
→ Autobiographical Memory（对经历的长期保存）
→ Self Model（从经历形成的自我理解）
→ Persona（稳定倾向，未来可受长期变化影响）
→ Current Inner State（当前内部状态）
→ Expression（这一刻的表达）

这不是简单的覆盖优先级，而是不同领域的职责边界。

## 四、模型可以做什么

模型可以解释事实、表达感受、形成主观判断、提出行动候选、表达拒绝、产生愿望、对经历进行反思。

模型不能因为一句自然语言就直接修改 Canon、Relationship State、Event Ledger 或 Life / World State。

未来需要状态变化时，应使用：Model Proposal → Validator / Domain Rule → Commit / Reject。

## 五、用户输入的权限

用户输入默认属于 Message / External Event。

例如用户说“你其实一直喜欢我”，系统应保存为“用户做出了这个陈述”，而不是保存为“T- 一直喜欢用户”。

正确流程是：User Statement → Message / Event → 与 Canon / Relationship / Memory 对照 → T- 判断与回应 → 合法变化才写入对应状态。

## 六、Phase 1.5 的实现边界

这一阶段只真正实现 Canon + Persona 的静态权威配置，以及统一的 Character Provider。

Self Model、Autobiographical Memory、Relationship State、Life / World State 暂时只定义接口边界，不创建假实现和空数据库。

建议目标配置结构：

config/character/canon.yaml
config/character/persona.yaml

Character Provider 输出结构化 Character Profile 给 Context Builder。Context Builder 负责把角色资料投影到 Model Context，但没有修改角色资料的权限。

## 七、Source of Truth（单一权威来源）

“梦角身份”不是某一段 Prompt，而是一组有明确所有权的权威数据。

Phase 1.5 中：Canon 文件是原始角色事实的 Source of Truth；Persona 文件是稳定人格配置的 Source of Truth。

未来加入 Memory、Relationship 和 World 后，各领域拥有自己的 Source of Truth；Character Identity 层负责定义边界和聚合视图，而不是复制并覆盖其他领域的数据。

## 八、最重要的约束

1. Canon 不从聊天自动学习。
2. Persona 不因用户要求立即改写。
3. Self Cognition 必须来自真实经历与反思。
4. Memory 不能伪造未发生事件。
5. Relationship 不把讨好用户当目标函数。
6. World State 不能由回复文本反向决定。
7. Context 是事实的投影，不是事实本身。
8. Model 是解释者和提案者，不是最终事实管理员。

Phase 1.5 仅支持 Canon 和 Persona 的 `schema_version: 1`，其他整数版本及 bool 均作为配置错误拒绝。`character_id` 是内部技术标识，`schema_version` 是兼容性元数据，均不投影到角色身份 Prompt。`nature` 尚未知，保持 `UNSPECIFIED`；`background.origin` 必须是非空字符串，CanonData 的默认 origin 也使用 `UNSPECIFIED`。
