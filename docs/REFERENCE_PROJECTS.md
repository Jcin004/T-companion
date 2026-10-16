# 参考项目说明

本项目会参考多个现有项目，但不会直接把它们机械拼接在一起。

原则：

> 学习它们的设计与实现方式，再按照我们自己的架构定义接口。

---

# 1. WrenWen

主要参考：

- Agent Runtime
- Context Assembly
- Memory 架构
- Desire
- Wake
- Intent
- Self Cognition

我们主要从 WrenWen 学习：

> AI 的“生命系统”应该如何组织。

WrenWen 更偏架构和设计思想。

---

# 2. AionsHome

主要参考：

- Frontend
- Backend
- FastAPI
- WebSocket
- MCP
- Tool 调用
- 多设备交互
- 摄像头、位置、语音等实际功能

我们主要从 AionsHome 学习：

> AI 应用如何真正落地成可以运行的软件。

---

# 3. Ombre-Brain

主要参考：

- 长期 Memory
- Memory Retrieval
- 情绪相关记忆
- 记忆衰减
- 向量检索
- Hybrid Retrieval
- MCP Memory Service

我们主要从 Ombre-Brain 学习：

> AI 的长期记忆系统可以如何实现。

未来如果接入 Ombre-Brain，应通过：

```text
MemoryProvider
      ↓
Ombre Adapter
      ↓
Ombre-Brain
```

而不是让 Agent Runtime 直接依赖它的内部实现。

---

# 4. 三个项目与我们的关系

```text
WrenWen
  ↓
学习“AI 怎么运行”

AionsHome
  ↓
学习“AI 怎么落地”

Ombre-Brain
  ↓
学习“AI 怎么记忆”
```

我们的项目会重新定义自己的：

- 模块边界
- 接口
- 数据模型
- 开发阶段

因此它们是参考项目，不是最终系统本身。
