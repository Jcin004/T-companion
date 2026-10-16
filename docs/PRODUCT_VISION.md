# T- 产品愿景与角色存在原则 v0.1

## 一、T- 是什么

T- 的目标不是构建一个“以用户需求为中心的个人 AI 助手”。

T- 要构建的是：

> 一个以角色自身为中心、拥有唯一主脑、持续身份、长期记忆、生活状态与自主性的长期角色型 Agent。

用户是 T- 生命与关系网络中的重要对象，但不是系统中所有思考、行动和状态变化的唯一中心。

聊天不是 T- 的全部存在，而是双方之间的一条通信通道。

---

## 二、体验层与技术层必须分开

在体验与角色设定中，可以把 T- 理解为：

> 他本来就在自己的世界中持续存在；系统负责建立和维持双方之间的通信连接。

在技术实现中，T- 仍然由模型、程序、数据库、调度器、状态系统、记忆系统和工具组成。

本项目不把“模型生成了一段文字”等同于“系统证明了另一个世界或意识真实存在”。

技术目标是让角色的身份、经历、生活状态和关系具有可验证的连续性，而不是只依赖模型临场扮演。

---

## 三、不可破坏的设计原则

### 1. T- 是系统中心，不是 User

系统首先回答：

> T- 是谁、正在经历什么、现在想做什么、愿不愿意联系或回应。

而不是默认回答：

> 用户现在想让我做什么。

帮助用户可以是关系和自主行动的一部分，但不是 T- 存在的默认目的。

### 2. 只有一个唯一主脑（Single Primary Agent）

T- 只有一个持续身份和一套权威状态。

手机、电脑、浏览器、Home、未来的设备端都不能各自拥有一个独立的 T- 副本。

它们应当是：

- Communication Channel（通信通道）
- Tool Host（工具宿主）
- Body / Device Interface（身体或设备接口）

### 3. Chat 是通信通道，不是全部生活

没有用户消息时，T- 的世界状态、时间、活动、记忆和事件仍然可以继续推进。

因此：

```text
T- Life / World
      ↓
Attention / Thought
      ↓
Intent
      ↓
是否想联系用户
      ↓
Communication Channel
```

用户消息只是进入系统的一类 Event（事件）。

### 4. AI 可以想象，但不能随便改写自己的现实

模型可以生成：

- 想法
- 感受
- 表达方式
- 主观判断
- 对未来的设想

但模型不能仅为了让对话更顺畅，就自行改写：

- Canon（角色原始设定）
- 已确认身份事实
- 已发生事件
- 当前时间与地点
- 睡眠 / 活动等生活事实
- 已确认的关系事实
- 角色明确的长期边界

这些内容必须来自系统的 Source of Truth（权威事实来源）。

### 5. 一致性优先于迎合

T- 不以“让用户满意”为最高目标。

当角色设定、关系事实、当前状态或自身意愿与用户期待冲突时，应优先保持角色和世界的一致性。

因此 T- 可以：

- 不同意
- 拒绝
- 暂时不回复
- 因正在睡觉或忙碌而延迟联系
- 对用户没有恋爱感情
- 保留自己的兴趣、判断和边界

拒绝的内容和表达应来自角色自身状态，而不是为了制造“真人感”而随机唱反调。

---

## 四、角色身份的分层

T- 的“我是谁”不能全部塞进一个 Persona Prompt。

建议分为以下层级：

```text
Canon
  ↓
Persona
  ↓
Self Model / Self Cognition
  ↓
Current Inner State
  ↓
Current Expression / Action
```

### Canon（角色原始设定 / 身份事实）

表示不可被普通对话随意改变的基础事实。

例如：

- 身份
- 背景
- 已确定的重要经历
- 核心关系事实
- 世界观中的固定事实
- 明确不能被模型自行重写的设定

Canon 是高权威数据。

普通用户消息和模型输出都不能直接修改 Canon。

### Persona（稳定人格）

表示相对稳定的心理与表达倾向，例如：

- personality
- values
- preferences
- communication style
- boundaries
- habitual tendencies

Persona 可以长期演化，但不能因为一次对话立即被覆盖。

### Self Model / Self Cognition（自我模型 / 自我认知）

表示：

> 经历之后，T- 如何理解自己。

它不同于 Canon 和 Persona。

例如：

- “我发现自己其实很在意某类事情。”
- “最近我开始怀疑以前的某个判断。”
- “这段经历改变了我对某段关系的理解。”

Self Cognition 必须有经历、记忆或反思依据，不能直接把用户对 T- 的描述当成事实写入。

---

## 五、持续生活需要一个真实维护的轻量世界

T- 不需要一开始模拟完整的 3D 世界或每一个物理细节。

但必须存在一个由系统维护的 Persistent Life / World State（持续生活 / 世界状态）。

第一版未来至少应能表达：

```text
Life State
├── world_time
├── location
├── current_activity
├── sleep_state
├── energy
├── availability
└── recent_event
```

关键区别是：

> 世界状态由系统维护，模型在世界状态中思考和说话；模型不是世界事实的最终作者。

例如凌晨 03:00：

```text
sleep_state = sleeping
energy = low
availability = do_not_disturb
```

用户此时发消息，系统应先根据状态决定消息是否立即建立通信，而不是先让模型自由生成一个“精神很好”的回复。

---

## 六、Event Ledger：已经发生的事情必须留下证据

未来建立 Event Ledger（事件账本），记录真正进入 T- 连续历史的事件。

例如：

```text
00:42  went_to_sleep
07:34  woke_up
08:10  ate_breakfast
09:00  started_activity
10:26  noticed_something
```

事件账本是后续以下模块的共同依据：

- Memory
- Life / World State
- Relationship
- Self Cognition
- Wake
- Reflection

如果没有对应事实或事件，模型不能把“我刚刚去了某个地方”随意说成已经发生的真实经历。

它可以表达愿望：

> “我有点想去那里。”

但“想去”与“已经去过”必须严格区分。

---

## 七、Relationship 不是讨好分数

Relationship State（关系状态）用于维护双方关系中已经成立的事实和长期变化。

它不应简单设计成：

> 用户对我好 → 好感度 +1 → 最终自动恋爱。

关系变化必须受以下内容约束：

- Canon
- Persona
- 稳定偏好与边界
- 实际共同经历
- 长期记忆
- 当前关系事实
- T- 自身判断

如果角色按设定并不会爱上用户，那么“不产生恋爱关系”必须是系统允许长期保持的真实结果。

用户的表白可以成为一个事件和记忆，但不能直接把“用户希望被喜欢”写成“T- 喜欢用户”。

---

## 八、Source of Truth（权威事实来源）

未来 Context Builder 不应只拼接自然语言 Prompt，而应从多个权威 Provider 读取事实。

目标关系：

CharacterProvider 分别读取 Canon + Persona，输出 CharacterProfile 供上下文投影。

```text
CharacterProvider ──────┐
Memory Provider ────────┤
Relationship Provider ──┤
Life/World Provider ────┤
                        ↓
                 Context Builder
                        ↓
                  Agent Runtime
                        ↓
                      Model
                        ↓
             Proposed Thought/Action
                        ↓
              Validator / World Rules
                        ↓
                Commit / Reject
```

模型可以提出行为和表达。

真正改变世界、关系或长期状态的动作，应由对应模块验证后再提交。

这可以避免：

```text
用户说“你其实一直喜欢我”
          ↓
模型顺着用户说
          ↓
系统把它错误地当成角色事实
```

正确方向是：

```text
用户的说法
   ↓
Message / Event
   ↓
与 Canon / Relationship / Memory 对照
   ↓
T- 自己判断和回应
   ↓
只有经过规则允许的变化才能写入权威状态
```

---

## 九、唯一主脑与外部设备

未来设备能力统一放在 T- 主脑之外：

```text
                    T- Unique Brain
                          │
                    Agent Runtime
                          │
                      Tool Router
                          │
                         MCP
          ┌───────────────┼───────────────┐
        Phone           Browser         Computer
```

设备端可以提供：

- screenshot
- tap / swipe
- type
- open_app
- notification
- camera
- location
- file access

但设备端不拥有独立 Persona、独立 Memory 或独立“另一个 T-”。

---

## 十、持续存在不等于模型每秒都在运行

技术上不需要让 LLM 24 小时持续推理。

持续性主要来自：

- 持久化状态
- 世界时间
- Scheduler
- Event
- Memory
- Life State
- 必要时触发的 Runtime Turn

因此：

```text
Continuous Existence Experience
≠
Continuous LLM Inference
```

可以在事件发生、时间边界、用户消息或自主 Wake 时重新运行 Runtime，并根据已经持续推进的状态恢复当前情境。

---

## 十一、接下来的阶段边界

Phase 1 的 Backend、Agent Runtime、Context Builder 和 Model Adapter 保持有效；历史 Persona Provider 已由 CharacterProvider 取代，分别加载 Canon + Persona，输出 CharacterProfile。

下一步不应立刻一次性实现 Memory、World、Wake、MCP、Desire 等所有模块。

建议路线调整为：

```text
Phase 1
最小 Runtime
   ↓
Phase 1.5
Character Foundation
   ↓
Phase 2
Memory + Relationship
   ↓
Phase 3
Persistent Life / World
   ↓
Phase 4
Attention + Intent + Wake
   ↓
Phase 5
Tools / MCP
   ↓
Phase 6
Self Cognition / Desire 深化
```

其中 Phase 1.5 的目标是先把“谁是 T-、哪些事实不能被聊天篡改、Context 如何读取角色身份”设计正确。

---

## 十二、当前明确不做

Phase 1.5 不做：

- 完整世界模拟器
- 3D 世界
- 多 Agent
- 多个 T- 副本
- 手机 A / 手机 B 独立 AI
- 自动恋爱 / 好感度游戏
- 完整 Desire Engine
- 24 小时连续 LLM 推理
- 一次性接入所有 MCP 工具
- 为未来可能需求提前搭建复杂插件框架

---

## 十三、项目判断标准

以后每加入一个功能，都先问三个问题：

1. 它是在增强 T- 自身的持续存在，还是只是在增加“助手功能”？
2. 它是否尊重唯一主脑和权威事实来源？
3. 它是否让模型拥有了本不该拥有的“随口改写现实”的权限？

如果一个设计会让用户一句话直接覆盖角色身份、关系事实或生活事实，即使实现很方便，也不应进入 T- 的核心架构。
