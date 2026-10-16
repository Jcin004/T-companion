# 第一阶段开发规格（PHASE_1_SPEC.md）

本文保留 Phase 1 历史规格。Phase 1.5 当前角色配置与接口以
CHARACTER_IDENTITY.md 和 INTERFACE_DESIGN.md 为准；旧 Persona-only 配置已移除。

## 一、这一阶段的目标

第一阶段只做一件事：

> 搭出项目最小可运行骨架，并让“HTTP 请求 → AI 回复”这条链路真正跑通。

这一阶段不追求完整功能，不做长期记忆、自主行动、多端同步，也暂时不做真正前端界面。

成功标准：

```text
HTTP Request
   ↓
Backend API
   ↓
Agent Runtime
   ↓
Context Builder
   ├── System Instructions
   ├── Persona
   └── User Message
   ↓
Model Adapter
   ↓
Model
   ↓
Response
```

能够稳定工作。

---

# 二、第一阶段必须实现的模块

## 1. Backend API

负责接收请求，并把请求交给 Agent Runtime。

第一版只需要一个最简单的聊天接口：

```text
POST /api/chat
```

输入：

```json
{
  "message": "你好"
}
```

输出：

```json
{
  "response": "你好。"
}
```

Backend 不负责：

- 直接拼完整 Prompt
- 直接调用具体模型 Provider
- 直接操作 Memory
- 决定 AI 行为

它只是系统入口和运行承载层。

## 2. Agent Runtime

负责组织一次 AI 运行。

流程：

```text
收到 user_message
      ↓
调用 Context Builder
      ↓
获得 Context
      ↓
调用 Model Adapter
      ↓
获得模型结果
      ↓
返回 Response
```

第一阶段 Runtime 暂时不处理：

- Tool Calling
- Desire
- Goal
- Intent
- Wake
- Memory
- Session
- 多 Agent

但接口要允许未来扩展。

## 3. Context Builder

第一版 Context 只包含：

```text
System Instructions
+
Persona
+
当前 User Message
```

以后再逐步加入：

- Conversation History
- Memory
- Goal / Intent
- World State
- Tool Results

第一版不要提前塞入这些能力。

## 4. Persona

第一版使用静态配置。

例如：

```text
config/persona.yaml
```

示例：

```yaml
name: AI
identity: 一个个人 AI 助手
communication_style:
  - 自然
  - 清晰
  - 不夸张
```

第一阶段 Persona 不进入数据库。

## 5. Model Adapter

Agent Runtime 不应该直接写某一家模型 SDK 调用。

统一调用：

```python
model.generate(context)
```

第一阶段只需要一个可用 Provider，例如：

```text
OpenAIProvider
```

同时保留统一接口，未来可以增加：

- ClaudeProvider
- GeminiProvider
- LocalModelProvider

---

# 三、第一阶段不做真正 Frontend

Phase 1 只验证后端 AI 核心链路。

暂时通过：

- API 测试
- curl / HTTP Client
- 自动化测试

调用 `/api/chat`。

真正的 Home / Web Frontend 在后续阶段再接入。

这样可以先验证核心架构，而不是同时处理界面问题。

---

# 四、推荐项目目录

```text
T-/
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   └── chat.py
│   │   ├── agent_runtime/
│   │   │   └── runtime.py
│   │   ├── context/
│   │   │   └── builder.py
│   │   ├── persona/
│   │   │   └── provider.py
│   │   ├── model/
│   │   │   ├── base.py
│   │   │   └── openai_provider.py
│   │   └── config/
│   │       └── settings.py
│   ├── tests/
│   └── requirements.txt
│
├── config/
│   └── persona.yaml
├── docs/
│   └── ...
├── .env.example
├── .gitignore
└── README.md
```

Codex 可以在不破坏模块边界的前提下调整细节。

---

# 五、第一阶段技术选择

```text
语言：
Python

Backend：
FastAPI

配置：
环境变量 + YAML/JSON

测试：
pytest

数据库：
无

前端：
无

正式部署：
暂不做
```

目标是验证架构和运行链路。

---

# 六、环境变量

API Key 不允许写进代码或提交 GitHub。

使用：

```text
.env
```

提供：

```text
.env.example
```

例如：

```text
OPENAI_API_KEY=
MODEL_NAME=
```

并确保 `.env` 在 `.gitignore` 中。

---

# 七、模块调用规则

严格保持：

```text
API
 ↓
Agent Runtime
 ↓
Context Builder
 ↓
Model Adapter
```

禁止：

```text
API → 直接调用 Model
```

禁止：

```text
Context Builder → 直接调用外部 Tool
```

禁止：

```text
Persona → 控制 Runtime
```

---

# 八、第一阶段明确不实现

- 数据库
- Session
- Message 持久化
- 长期 Memory
- Vector Database
- Ombre-Brain
- Tool / MCP
- Desire Engine
- Goal Manager
- Intent 系统
- Wake / Scheduler
- Self Cognition
- World State
- Home / 手机 A / 手机 B
- WebSocket
- 原生 App
- 多 Agent
- 多用户权限
- 自动化任务
- 自主行动

---

# 九、测试要求

至少包含：

## Context Builder 测试

确认：

- Persona 能进入 Context
- User Message 能进入 Context

## Model Adapter 测试

使用 Mock Model。

不调用真实付费 API 也能测试 Runtime。

## Agent Runtime 测试

确认：

```text
User Message
 ↓
Context
 ↓
Model
 ↓
Response
```

## API 测试

确认：

```text
POST /api/chat
```

返回正确格式。

---

# 十、日志要求

至少记录：

- Runtime 开始
- Context 构建完成
- 模型调用开始
- 模型调用结束
- 错误信息

不要记录：

- API Key
- 完整敏感配置

---

# 十一、错误处理

至少处理：

- API Key 未配置
- 模型调用失败
- 模型返回空内容
- 请求格式错误

API 不应把完整 traceback 直接返回给调用方。

---

# 十二、完成标准

Phase 1 只有满足以下条件才算完成：

- 项目可以正常启动
- FastAPI 服务可运行
- 存在 `/api/chat`
- Agent Runtime 独立成模块
- Context Builder 独立成模块
- Persona 独立成配置或 Provider
- Model Adapter 已抽象
- 至少一个模型 Provider 可用
- Mock Model 测试可运行
- API Key 不进入仓库
- 基础测试通过
- README 有启动说明
- 没有提前实现数据库 / Memory / Tool / Wake 等后续能力

---

# 十三、人工验收流程

1. 启动 Backend。
2. 调用 `/api/chat`。
3. 发送：

```json
{
  "message": "你好"
}
```

4. 确认真实走过：

```text
API
 ↓
Runtime
 ↓
Context
 ↓
Model
 ↓
Response
```

5. 更改 Persona 配置，再次调用。
6. 确认 Context 使用了新的 Persona。
7. 使用 Mock Model 跑测试。

---

# 十四、Phase 1 完成后的检查

进入 Phase 2 前先检查：

- Runtime 是否过度依赖具体 Model
- Context 是否容易扩展
- Persona 是否与 Runtime 解耦
- API 是否只是入口
- 是否方便加入 Session / Memory

确认没有明显问题后，再进入 Phase 2。

---

# 十五、Phase 2 预告

Phase 2 主要加入：

- Session
- Message
- SQLite
- 最简单的 Memory

预计：

```text
User
 ↓
Agent Runtime
 ↓
Context Builder
 ├── Persona
 ├── Recent Messages
 └── Memory
 ↓
Model
 ↓
Response
 ↓
Message / Memory
```

---

# 十六、给 Codex 的第一条开发指令

```text
请先阅读：

docs/PROJECT_CONTEXT.md
docs/ARCHITECTURE.md
docs/MODULE_DESIGN.md
docs/INTERFACE_DESIGN.md
docs/DATA_MODEL.md
docs/PHASE_1_SPEC.md
docs/ROADMAP.md

先不要修改代码。

请总结你对项目架构的理解，并检查 Phase 1 是否存在明显冲突、职责重叠或无法实现的设计。

如果发现问题，先提出问题和修改建议。

如果没有阻塞问题，再给出 Phase 1 的具体实施计划。
```

架构审查完成后，才开始写代码。

---

# 十七、核心原则

```text
先跑通
再扩展

先解耦
再丰富

先测试
再加功能
```

Phase 1 的价值不是做出很强的 AI，而是：

> 建立一个以后可以安全接入 Memory、Tools、Wake、Desire 和多端系统的正确骨架。
