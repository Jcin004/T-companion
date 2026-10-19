# 可选 OB 只读召回原型

## 当前范围

本机网页/Android 可在发送聊天请求前查询独立运行的 OB 网关。默认关闭，本机 BM25、来源校验、人工编辑、每日总结与聊天继续可用。共同后端模式尚未接入这项功能。

这是只读接入，不自动上传聊天、复制本机记忆、迁移记录或同步数据库。查询会把当前输入的前 2000 字发送到已配置网关；历史、名册、模型密钥不会随查询上传。查询无额外聊天模型调用。当前网关明确关闭 embedding，只使用 OB 的文字/关键词/BM25；不能把连接成功称为真实语义检索通过。

外部安装的代码固定为 [Jcin004/Ombre-Brain `115d831d979bf67efc7150f976e2cb34c333c935`](https://github.com/Jcin004/Ombre-Brain/tree/115d831d979bf67efc7150f976e2cb34c333c935)，启动检查完整 Python 源码树指纹。调用原版 `BucketManager` 和 `SurfacePolicyVM` 的 automatic 策略；不解析 MCP 排版文字，也不带入随机联想。没有复制或修改 OB 实现。

## 模块与数据流

```text
LocalService.prepareRecall（会话确定人物，scope 固定 daily）
  → 本地 recallPlan
  → ExternalMemory（开关、超时、取消、响应核对、去重、预算）
  → 浏览器 fetch / TLocal.memoryRequest（凭据与传输）
  → 可选 OB 网关（鉴权，人物＋scope 查固定映射）
  → OB search ＋ automatic 浮现策略
  → OB 桶原文与 ID
  → buildContext（临时加入当前请求，不写聊天历史）
```

- 网关不接触聊天数据库，也不接受请求指定文件路径；只读配置中预先绑定的 vault。多个绑定的目录不得相同或互相包含。
- 单个访问口令属于用户自己的整个网关，**不是每人物的权限凭据**。当前宿主从会话确定人物，模型没有任意调用网关的工具。持有口令的人可查询该网关配置内的其他人物，不能当作多租户鉴权。
- 网关支持 daily/story 独立映射；当前产品只有 daily 发送入口。故事入口未开发。
- 桶正文是外部回忆，带 ID 追溯，但尚未与本机原始消息逐字核验，不覆盖 Canon。原始聊天仍须通过本机来源或 OB 原档案核对。
- 按 OB ID、与本地完全相同的正文去重，整条计预算。不同改写是否同源尚无跨库映射。
- 设置走现有事务；口令独立保存，按精确 origin 的 SHA-256 绑定。即使新地址设置保存失败，也不会把新口令发给旧地址。普通备份不含口令，恢复后外部开关关闭。
- Android 复用 Keystore 和取消连接表，新增受大小/时间限制的 JSON 请求，不开放任意请求头，不把凭据读回 JS。网页仍使用现有 localStorage 凭据机制。
- 全局关闭“聊天时召回相关记忆”也停止外部查询。超时、授权或格式失败提示 fallback 并记录日志，继续本地聊天；主动取消则停止本轮，不再调用聊天模型。

## 部署与使用

网关需要一台运行 Python 的设备，普通手机本地聊天不依赖它。手机的 `127.0.0.1` 指手机自身；连接电脑需要可达的 HTTPS 地址，不要把口令写进 URL。

1. 在独立 Python 3.12 虚拟环境安装 `backend/requirements-lock.txt` 和 `backend/requirements-ob-core.txt`。
2. 获取固定提交的 OB 源码 ZIP，保持源码字节不变。真实 vault 由自己的备份流程保护；本轮测试没有访问它们。
3. 将 `config/ob-gateway.example.json` 复制到被忽略的 `data/ob-gateway.json`，填写源码目录、人物 ID、对应 vault 和允许的网页 origin。网页 origin 是前端地址；配置文件不提交 Git。
4. 在终端设置 `T_OB_GATEWAY_CONFIG` 为配置文件绝对路径，`T_OB_GATEWAY_TOKEN` 为至少 24 字符的独立随机口令。不要使用模型 API Key。口令只在终端环境和 App 配置填写。
5. 启动：

```powershell
python -m uvicorn backend.ob_gateway:from_env --factory --host 127.0.0.1 --port 8019
```

公网或局域网使用由自己的 HTTPS 反向代理转发回环端口，不直接暴露裸 HTTP。

入口：**记忆 → 外部记忆 · OB（可选）**。填写网关根地址与口令，保存并测试连接，再选择启用。人物 ID 可从本机备份的 `characters[].id` 核对；只复制 ID，不上传整个备份。当前没有 App 自动管理网关映射的功能。

连接成功仅证明网关可达。对应 vault 要有该人物的 OB 记录才能召回；未配置该人物返回 404，客户端提示并继续本地模式。不能据此推断原始记忆已同步。

## 复现验证

```powershell
npm test
python -m pytest -q -W error
python scripts/verify-ob-gateway.py --source <固定提交的OB源码目录>
```

最后一项在临时目录新建虚构 vault，通过 ASGI HTTP 调用真实 OB 代码，核对人物/剧情分库、无结果、已消化内容排除及来源 ID；换说法探针仍失败，单独报告。

浏览器完整流程：先构建网页，在 `127.0.0.1:8028` 提供 `dist/`，另开终端运行：

```powershell
python scripts/verify-ob-gateway.py --source <固定提交的OB源码目录> --serve --port 8029
node tests/external-memory-browser.mjs
```

测试服务只有虚构数据及公开 fixture 口令，不作为个人服务长期运行。浏览器使用隔离配置、真实 HTTP 与真实 OB 检索；聊天模型拦截模拟，没有真实模型调用。Node 覆盖超时、取消、错人物/错分区、授权失败、预算、去重、备份、凭据绑定及模拟 native adapter；模拟适配与原生实际联网是不同证据。

本轮记录：82 项 Node、92 项 Python 测试通过；真实 OB 网关 9 项必过检查通过（含另一实例编辑后立即刷新策略），换说法探针失败；新接入浏览器端到端与既有记忆召回浏览器回归通过。Android `:app:assembleDebug` 在本机 JDK 21、校验后的 Gradle 8.11.1 下离线构建通过；未安装到实体手机，未验证真机联网，也未发布新 APK 或更新渠道。

下一阶段：真实本地 embedding 的语义效果与资源测试、Latent 正式 hook 最终交付、有来源的写入/迁移。开场未完事项与自主分享不在本轮范围。
