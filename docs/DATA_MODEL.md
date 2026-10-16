# 数据模型设计 v0.2

## 一、目的

本文档描述系统未来需要的数据类型、关系和生命周期。

注意：

> 本文档描述的是“目标数据模型”，不代表 Phase 1 就要全部实现。

Phase 1 不使用数据库。

数据库与持久化从 Phase 2 开始。

---

# 二、核心原则

## 1. 客户端不是记忆本体

```text
Home
手机 A
手机 B
   ↓
统一 Backend
   ↓
统一 Identity / Session / Memory
```

客户端只是入口。

## 2. Memory 不等于 Database

```text
Database
= 存储介质

Memory
= 记忆能力
```

Memory 负责：

- 判断什么值得记
- 写入
- 检索
- 排序
- 总结
- 衰减
- 重新提供给 Context

## 3. Session 不等于 Memory

```text
Session
= 当前一段连续对话

Message
= 原始消息

Memory
= 从过去提炼出的长期可复用信息
```

---

# 三、目标核心实体

系统未来可能包含：

```text
User
Agent
Persona
Session
Message
Memory
Goal
Intent
WakeEvent
WorldState
ToolRecord
```

未来再扩展：

```text
SelfCognition
Desire
Emotion
Relationship
Task
Plan
```

这些实体不会在 Phase 1 一次性全部实现。

---

# 四、Phase 1 数据策略

Phase 1 不建数据库。

只使用：

- 静态 Persona 配置
- 环境变量
- 运行时内存中的临时 Context

因此 Phase 1 不实现：

- User 表
- Session 表
- Message 表
- Memory 表
- Goal 表
- WakeEvent 表

---

# 五、Phase 2 首批持久化数据

Phase 2 才开始加入：

```text
Session
Message
Memory
```

可选保留：

```text
User
Agent
Persona
```

第一版如果仍是单用户、单 Agent，也可以先使用固定 ID，避免过度设计。

---

# 六、User（未来）

表示系统用户。

建议字段：

```text
id
display_name
created_at
updated_at
```

---

# 七、Agent（未来）

表示一个 AI 个体。

建议字段：

```text
id
name
persona_id
status
created_at
updated_at
```

这样未来可以支持多个角色或多个 AI 实体。

---

# 八、Persona

表示：

> AI 是谁。

建议字段：

```text
id
agent_id
name
identity
personality
communication_style
values
rules
version
updated_at
```

Phase 1 使用静态文件。

以后再决定是否持久化到数据库。

---

# 九、Session

表示一段连续会话。

建议字段：

```text
id
user_id
agent_id
client_id
title
created_at
updated_at
last_active_at
```

client_id 可以记录来源：

```text
home
phone_a
phone_b
```

client_id 只表示入口，不限制数据共享。

---

# 十、Message

保存原始聊天内容。

建议字段：

```text
id
session_id
role
content
created_at
metadata
```

role：

```text
user
assistant
system
tool
```

最近 Message 可以作为短期 Context 来源。

---

# 十一、Memory

保存未来仍然有价值的信息。

Memory 不应该简单等于所有 Message。

建议字段：

```text
id
user_id
agent_id
type
content
summary
source
source_id
importance
created_at
updated_at
last_accessed_at
access_count
metadata
```

以后可以增加：

```text
embedding
emotion
decay_score
confidence
tags
relations
```

Memory 类型示例：

```text
fact
preference
event
relationship
project
experience
reflection
```

---

# 十二、短期上下文与长期记忆

```text
Message
  ↓
Session
  ↓
Context Builder
  ↓
Model
```

同时：

```text
重要 Message / Event
       ↓
Memory Writer
       ↓
长期 Memory
```

以后需要时：

```text
当前问题
   ↓
Memory Retriever
   ↓
相关 Memory
   ↓
Context Builder
   ↓
Model
```

---

# 十三、多端共享

## 长期共享

通过统一 Memory 完成。

## 短期衔接

未来可以采用：

- shared_session
- recent conversation summary
- cross-client context snapshot

Phase 2 初期先采用：

> 后端统一保存 Session / Message，并允许 Context Builder 按策略读取相关近期信息。

不在 Phase 1 实现。

---

# 十四、Goal（未来）

表示跨会话目标。

建议字段：

```text
id
user_id
agent_id
title
description
status
priority
progress
created_at
updated_at
completed_at
```

Goal 通常需要持久化，因为它可能跨多个 Session。

---

# 十五、Intent（未来）

表示当前这一轮准备做什么。

建议字段：

```text
id
runtime_id
goal_id
type
description
status
created_at
completed_at
```

Intent 可以直接来自用户请求，不一定必须先关联 Goal。

---

# 十六、WakeEvent（未来）

表示是什么原因触发新一轮 Runtime。

建议字段：

```text
id
agent_id
type
payload
scheduled_at
triggered_at
status
created_at
```

类型：

```text
user_message
timer
schedule
external_event
tool_callback
system_event
```

---

# 十七、WorldState（未来）

表示世界“现在是什么样”。

建议字段：

```text
id
source
key
value
updated_at
expires_at
```

WorldState 多数是临时数据。

```text
WorldState:
现在手机电量 32%

Memory:
昨天用户提到手机耗电很快
```

---

# 十八、ToolRecord（未来）

记录工具调用。

建议字段：

```text
id
runtime_id
tool_name
input
output
status
started_at
finished_at
error
```

用于：

- 调试
- 审计
- 恢复
- 未来 Memory 提炼

---

# 十九、Self Cognition（未来）

```text
Persona
= 预先定义“我是谁”

Self Cognition
= 经历之后“我如何理解自己”
```

可能来源：

```text
Memory
 ↓
Reflection
 ↓
Self Cognition
```

---

# 二十、Desire（未来）

未来可能形成：

```text
Desire ─────→ Goal
   │            │
   └────────→ Intent
                ↓
              Action
```

Desire 不直接调用 Tool。

---

# 二十一、数据库策略

## Phase 1

无数据库。

## Phase 2

优先：

```text
SQLite
```

原因：

- 简单
- 本地可运行
- 易于测试
- 足够支持初期 Session / Message / Memory

## 后续

根据需要再评估：

- PostgreSQL
- Vector Database
- 独立 Memory Service
- Ombre-Brain

重要原则：

> 上层模块通过 Repository / MemoryProvider 访问数据，不让 Agent Runtime 直接依赖某一种数据库。

---

# 二十二、Ombre-Brain 的位置

如果未来采用：

```text
Agent Runtime
      ↓
MemoryProvider
      ↓
Ombre Adapter
      ↓
Ombre-Brain
```

而不是直接操作 Ombre 内部数据库。

---

# 二十三、目标数据关系图

```text
User
 │
 ├──────────────┐
 ↓              ↓
Session        Memory
 │              ↑
 ↓              │
Message ────────┘
 │
 ↓
Context Builder
 │
 ├──── Persona
 ├──── Goal
 ├──── WorldState
 └──── Memory
 │
 ↓
Agent Runtime
 │
 ├──── Model
 └──── Tool Router
        │
        ↓
    ToolRecord

WakeEvent
   │
   └────────→ Agent Runtime
```

---

# 二十四、当前不强行定死的内容

- Vector Database 选型
- Embedding 模型
- Memory 自动遗忘算法
- Desire 数据结构
- Self Cognition 生成机制
- 多 Agent 数据隔离
- 多用户权限系统
- 分布式数据库
- 跨设备实时同步协议

这些内容等最小系统跑通后再决定。

---

# 二十五、核心结论

```text
Phase 1：
不做数据库

Phase 2：
Session + Message + 基础 Memory

后续：
Goal / Intent / Wake / WorldState / ToolRecord
```

最终目标：

> 无论用户从 Home、手机 A 还是手机 B 进入，面对的都是同一个持续存在的 AI 系统，而不是三个彼此隔离的聊天机器人。
