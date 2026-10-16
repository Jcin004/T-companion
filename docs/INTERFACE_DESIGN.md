# 接口设计说明 v0.3

## 一、目的

本文档定义系统模块之间如何通信。

原则：

- 模块职责分离
- 不依赖内部实现
- 通过明确接口通信
- 方便未来替换模块

---

# 二、Phase 1 调用关系

```text
HTTP Request
    ↓
Backend API
    ↓
Agent Runtime
    ↓
Context Builder
    ↓
Model Adapter
    ↓
Response
```

Phase 1 暂时没有 Session、Memory、Tools、Wake。

---

# 三、Agent Runtime 接口

## Phase 1 输入

```json
{
  "user_message": "用户输入"
}
```

## Phase 1 输出

```json
{
  "response": "AI 回复"
}
```

未来可以扩展：

```json
{
  "response": "AI 回复",
  "actions": [],
  "runtime_id": "..."
}
```

Phase 2 以后再加入 session_id。

Agent Runtime 可以调用：

- Context Builder
- Model Adapter
- Memory Provider（未来）
- Tool Router（未来）
- Goal / Intent（未来）

---

# 四、Context Builder 接口

## Phase 1 输入

```json
{
  "system_instructions": "...",
  "character": {"canon": {}, "persona": {}},
  "user_message": "..."
}
```

## 输出

```json
{
  "system": "...",
  "messages": [
    {
      "role": "user",
      "content": "..."
    }
  ]
}
```

未来输入可以加入：

- recent_messages
- memories
- goal
- intent
- world_state
- tool_results

Context Builder 不负责读取某个具体数据库实现。

---

# 五、Character Provider 接口（Phase 1.5）

```text
CharacterProvider.get() -> CharacterProfile(canon: CanonData, persona: PersonaData)
```

Canon 和 Persona 是两个独立的不可变数据对象，分别从
`config/character/canon.yaml` 和 `config/character/persona.yaml` 解析。
每次 get() 都读取当前权威配置，不缓存，不混合字段。
配置缺失或无效统一抛出 CharacterConfigurationError。Canon 与 Persona 都仅支持整数版本 1（bool 不合法）；origin 必须非空，未知值使用 UNSPECIFIED。character_id 与 schema_version 是技术元数据，不进入身份 Prompt。

Runtime 依赖 CharacterProvider 协议，由 main.py 组合具体 YAML 实现。
ContextBuilder.build(system_instructions=..., character=..., user_message=...)
只读投影 CharacterProfile，Canon 出现在 Persona 之前。
用户消息仅作为 user ModelMessage，不能写入角色资料。
ModelContext 的 system / messages contract 保持 provider-neutral。

System Instructions 承载 System Invariant / Runtime Rule，CharacterProfile 只承载 Character Data。Runtime 固定提供 BASE_RUNTIME_INVARIANTS，再追加 Settings.additional_system_instructions；上下文顺序为 BASE_RUNTIME_INVARIANTS → 可选附加指令 → Canon → Persona；User Message 单独位于 messages，不混入 system 或角色资料。

---

# 六、Model Adapter 接口

统一接口：

```text
ModelAdapter.generate(context) -> ModelResult
```

输入：

- Model Context

输出示例：

```json
{
  "text": "模型回复"
}
```

未来不同 Provider：

- OpenAIProvider
- ClaudeProvider
- GeminiProvider
- LocalModelProvider

Runtime 不直接依赖具体 Provider SDK。

---

# 七、Memory Provider 接口（Phase 2+）

## 写入

```text
MemoryProvider.write(memory_candidate)
```

## 查询

```text
MemoryProvider.retrieve(query, limit) -> Memory[]
```

返回示例：

```json
[
  {
    "content": "相关记忆",
    "score": 0.9
  }
]
```

未来如果接 Ombre-Brain，应通过 Memory Adapter 实现该接口。

---

# 八、Tool Router 接口（Phase 3+）

统一示意：

```text
ToolRouter.execute(tool_name, arguments) -> ToolResult
```

调用关系：

```text
Agent Runtime
      ↓
Tool Router
      ↓
     Tool
```

Tool 可以是：

- 内置 Tool
- HTTP Tool
- MCP Tool

---

# 九、Wake 接口（未来）

统一概念：

```text
WakeTrigger -> WakeEvent -> Agent Runtime
```

WakeEvent 来源：

- 用户消息
- 定时器
- 外部事件
- 工具回调

Wake 只触发运行，不替 Runtime 做决策。

---

# 十、接口演进原则

Phase 1 只要求最小接口。

不要为了未来功能提前把所有字段塞进第一版。

演进顺序：

```text
Phase 1:
user_message
 ↓
runtime
 ↓
context
 ↓
model

Phase 2:
+ session_id
+ recent_messages
+ memory

Phase 3:
+ tool_calls
+ tool_results

Phase 4:
+ goal
+ intent
+ wake
```

---

# 十一、设计原则

1. Runtime 不直接操作数据库。
2. API 不直接调用模型。
3. Context Builder 不直接调用 Tool。
4. Memory 不控制 Runtime。
5. Character Provider 分别提供 Canon 身份事实与 Persona 稳定人格。
6. Model Adapter 只负责模型调用。
7. 接口先简单，后续按阶段扩展。
