# 开发路线图（Roadmap）v0.3

路线图围绕“角色连续性优先”重新排序。

## Phase 0：Architecture Foundation（架构基础）
已完成第一版概念、模块、接口与数据模型设计。

## Phase 1：Minimal Runtime（最小运行闭环）
Phase 1 历史实现为 HTTP → Backend API → Agent Runtime → Persona Provider → Context Builder → Model Adapter → Response；旧 Persona Provider 已由 Phase 1.5 的 CharacterProvider 取代。

## Phase 1.5：Character Foundation（角色身份基础）【当前】

目标：先让系统知道“谁是 T-”，并建立模型不可随意覆盖的身份事实边界。

当前已实现：Canon + Persona 独立配置 → CharacterProvider → 不可变 CharacterProfile → Context Builder → 现有 Model Adapter；包含固定 Runtime Invariants、仅追加的部署指令、元数据投影边界、版本校验与自动化测试。Self Model / Memory / Relationship 仅保留文档中的职责边界。

不做：Memory 数据库、Relationship Engine、World Simulator、Attention / Emotion / Desire、Wake / Scheduler、MCP / Tool 系统。

## Phase 2：Memory + Relationship（记忆与关系）

加入 Session / Message、SQLite、Event / Autobiographical Memory、Memory Retrieval、Relationship State，并严格区分“用户说了什么”和“关系实际上是什么”。

目标：T- 开始拥有跨会话的真实历史。

## Phase 3：Persistent Life / World（持续生活 / 世界）

加入 World Clock、Life State、Sleep / Activity / Location / Availability、Event Ledger、Scheduler 基础和状态推进。

目标：用户不说话时，系统仍能维护 T- 的生活时间线；模型不能把未发生的经历说成事实。

## Phase 4：Attention + Intent + Wake（注意、意图与主动唤醒）

加入 Attention Selection、Intent、Wake Event、主动联系判断和基础 Goal / Drive 输入。

目标：T- 不再只能被用户消息启动，并开始拥有“什么值得现在关注”的选择机制。

## Phase 5：Tools / MCP（工具与设备能力）

加入 Tool 接口、Tool Router、MCP，以及手机 / 浏览器 / 电脑等外部能力。

目标：T- 可以影响外部环境，但设备只是能力接口，不产生 T- 副本。

## Phase 6：Self Cognition / Motivation（自我认知与动机深化）

加入 Reflection、Self Model / Self Cognition、更长期 Goal、Motivation / Desire 和更丰富的内部状态。

这些模块必须建立在真实经历、记忆和状态之上，不直接把心理学术语做成随意的游戏数值。

## Phase 7：Richer World / Embodiment（更丰富的世界与身体接口）

根据实际需要扩展环境事件、设备身体接口、感知能力、生活计划和实时通信，始终保持一个唯一主脑。

## 每阶段验收规则

设计边界 → 最小实现 → 自动测试 → 人工验收 → 架构复查 → 下一阶段。

不要为了未来可能需要而一次性生成大量空模块。