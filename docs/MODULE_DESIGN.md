# 模块设计说明 v0.2

本文档定义每个模块：

- 负责什么
- 不负责什么
- 输入什么
- 输出什么
- 与谁交互

---

# 1. Agent Runtime

## 负责

协调一次 AI 运行流程。

## Phase 1 输入

- user_message

## 未来输入

- WakeEvent
- session_id
- runtime options

## 输出

- response
- actions（未来）
- runtime result

## 调用

- Context Builder
- Model Adapter
- Tool Router（未来）
- Memory Provider（未来）
- Goal / Intent（未来）

## 不负责

- 直接操作数据库
- 直接实现具体工具
- 直接绑定某一家模型 API
- 自己保存所有长期记忆

---

# 2. Context Builder

## 负责

把当前这一轮模型需要看到的信息组装成 Context。

## Phase 1 输入

- System Instructions
- Persona
- User Message

## 未来输入

- Recent Messages
- Memory
- Goal / Intent
- World State
- Tool Results

## 输出

- Model Context

## 不负责

- 保存长期记忆
- 调用外部工具
- 决定是否执行行动

---

# 3. Memory

## 负责

管理长期可复用信息。

功能包括：

- write
- retrieve
- rank
- summarize（未来）
- decay（未来）
- surface

## 输入

- event / memory candidate
- query

## 输出

- memories

## 不负责

- 控制 Agent Runtime
- 直接决定 Tool 调用
- 充当 Persona

---

# 4. Persona

## 负责

提供稳定身份信息。

包括：

- identity
- personality
- communication_style
- values
- rules

## 输出

- Persona Data

## 不负责

- 控制 Runtime
- 保存聊天记录
- 决定具体行动

---

# 5. Model Adapter

## 负责

统一不同模型 Provider。

统一调用示意：

```text
generate(context) -> model_result
```

## 不负责

- 构建 Context
- 选择 Tool
- 保存 Memory

---

# 6. Tool Router

## 负责

管理可用工具，并将工具调用路由到正确实现。

支持：

- 内置 Tool
- HTTP Tool
- MCP Tool

## 输入

- tool name
- arguments

## 输出

- Tool Result

## 不负责

- 决定人格
- 决定长期 Goal
- 自己主动唤醒 Runtime

---

# 7. Goal Manager（未来）

## 负责

保存与管理跨会话目标。

## 输出

- 当前 Goal
- Goal 状态

Goal 不是每一次简单请求都必须创建。

---

# 8. Intent（未来）

## 负责

表示：

> 当前这一轮准备做什么。

Intent 比 Goal 更短期。

它可以直接来自用户请求，也可以来自 Goal 或 Desire。

---

# 9. Desire Engine（未来）

## 负责

产生长期或内部驱动力。

关系：

```text
Desire ─→ Goal
   └────→ Intent
```

Desire 不直接调用 Tool。

---

# 10. Wake（未来）

## 负责

触发新的 Runtime Turn。

来源：

- user_message
- timer
- schedule
- external_event
- tool_callback

Wake 只负责“叫醒”，不负责“醒来后怎么做”。

---

# 11. World State（未来）

## 负责

保存或读取外部世界当前状态。

例如：

- 设备状态
- App 状态
- 当前项目状态

World State 多数是临时信息。

---

# 12. Backend

## 负责

承载：

- API
- 配置
- 数据访问
- 服务连接
- Runtime 生命周期

## 不负责

- 把 AI 决策逻辑塞进 API 路由
- 直接拼接完整 Prompt
- 直接决定 Tool / Memory 策略

---

# 13. Frontend

## 负责

- 展示界面
- 收集用户输入
- 展示响应
- 未来展示状态与操作

Frontend 不拥有 AI 的核心长期记忆。

---

# 开发原则

每个模块保持独立，通过明确接口通信。

Phase 1 只实现：

- Backend API
- Agent Runtime
- Context Builder
- Persona
- Model Adapter

其余模块只保留架构位置，不提前实现。
