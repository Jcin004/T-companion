# 0.3.0 手机本地试用版

默认流程：打开桌面 → 人设名册创建角色 → 设置填写模型地址、密钥、模型名并测试 → 名册发起聊天。无需 T- 后端。支持 OpenAI Chat Completions 的文字 SSE 协议；不包含 Anthropic、Gemini 原生协议或 Responses。

## 实现与数据

- `frontend/local-service.js` 是共享业务接口：身份投影、完整轮次上下文、请求幂等、分页、搜索、日历、备份。界面调用该接口或可选远程 API。
- Android：系统 SQLiteOpenHelper（API 23+），WAL 与事务保存本机文档快照。数据库位于应用私有目录。首版按快照持久化，内存保存记录索引，界面最多渲染 160 条；不是无限容量数据库方案。
- 浏览器：IndexedDB 事务保存文档。站点数据与 APK 数据独立。浏览器密钥使用 localStorage，同源脚本可读取，保护弱于原生安全存储。不要在不可信网页或共享浏览器配置中保存密钥。
- Android 密钥通过 Android Keystore AES-GCM 加密，密文位于私有 SharedPreferences；网络模块在原生层解密使用，不返回 JavaScript，不写日志。卸载会丢失私有数据库与 Keystore 密钥。
- Android 网络通过 HttpURLConnection 的 InputStream 按 SSE 事件读取并逐块通知界面，绕过浏览器 CORS；HTTPS 正常验证系统证书，不跟随重定向，不绕过 TLS。网页 fetch 需要服务商允许跨域。
- 请求前事务保存用户、轮次和空回复；生成中每约 400ms 保存部分文字。完成仅在服务端终止事件后标记。失败、停止、启动恢复为 interrupted 的内容不会进入后续上下文。重试复用原轮次及消息 ID。
- 回桌面、切 App 保留同一生成任务。切后台原生网络会停止；不保证后台持续生成。异常退出后的最后一个未提交片段可能丢失，已保存片段保留并标为中断，可重试。
- 原始身份仅由名册更新；程序规则从后端常量生成到 `runtime-rules.js`，测试防止漂移。聊天输出不能修改角色。
- 首版仅文字消息和内嵌头像，无消息附件、通知推送、自主生活或多设备同步。

## 迁移与备份

改动前已通过 SQLite backup API 保存电脑数据库快照到忽略目录 `data/backups/before-local-*.db`。旧后端与数据库不删除。

旧数据迁移：设置 → 高级 → 切到共同后端 → 导出备份；再切回本机 → 选择备份恢复。也可在旧网页导出 JSON 后通过系统文件选择器导入 APK。恢复明确替换当前数据源，请先导出当前数据；不会自动上传或合并。兼容旧版 version 1 与本机 version 2 JSON；密钥不随备份，需重新填写。头像、草稿随本机备份。当前没有附件数据。

## APK 与更新

包名 `io.jcin.tcompanion`，versionName `0.3.0-trial`，versionCode `3`。沿用 `data/signing/trial.keystore` 中的试用签名，不提交私钥或密码。内置网页资源；后端升级、网页刷新、APK 覆盖安装是三个不同操作。

使用系统安装界面覆盖安装；不要卸载旧版。设置“关于与更新”显示当前版本和更新方式。尚未实现 GitHub Releases 下载、校验及拉起安装；未发布公开 Release。朗读沿用 Android 系统 TTS，缺少中文语音时会提示。

## 来源与条件

| 功能 | 来源与版本 | 方式与条件 | 连接代码 |
| --- | --- | --- | --- |
| SSE JSON | float c1b0ea74，`lib/sse-json.ts` | 已有 AGPL-3.0-only 衍生文件；保留来源、许可证及 README 限制冲突记录，见根 NOTICE | 本机浏览器流式解析 |
| 桌面与切换 | float / SullyOS 行为参考 | 本项目独立 CSS/JS；未复制图像、字体、桌面代码或 SullyOS 受限代码 | 桌面路由、返回键、状态保存 |
| WebView 容器 | Capacitor 7.6.9，MIT | 沿用已锁定依赖与许可证 | TLocal / TDevice 桥接 |
| SQLite、安全存储、网络、声音 | Android 系统 API 23+，随 OS 提供 | 调用平台 API，无第三方实现源码复制；Android 文档代码 Apache-2.0，本适配层自行实现 | `TLocalPlugin.java` / `TDevicePlugin.java` |
| 浏览器数据库 | IndexedDB 平台 API | 不新增数据库依赖 | BrowserPersistence |

平台接口参考：[SQLiteOpenHelper](https://developer.android.com/reference/android/database/sqlite/SQLiteOpenHelper)、[Keystore](https://developer.android.com/privacy-and-security/keystore)、[HttpURLConnection](https://developer.android.com/reference/java/net/HttpURLConnection)。已有第三方完整许可证见 `THIRD_PARTY_NOTICES.md` 与 `frontend/licenses/`。
