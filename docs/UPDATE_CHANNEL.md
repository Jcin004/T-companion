# Android 更新渠道

0.7.1（versionCode 10）保留既有下载、哈希、大小、包名、签名、版本和安装权限检查，增加可配置清单地址。旧 0.7.0 需先手动覆盖安装新版，不能通过网页修改旧 APK 的原生网络逻辑。不要卸载旧版。

## 数据与调用

设置 → 关于与更新 → 更新渠道（高级）。最多三个公开 HTTPS JSON 清单，每行一个；不能放账号、口令、查询参数或模型 API 密钥。配置由 TUpdate 原生插件保存到设备独立 SharedPreferences，不属于人物、聊天或模型配置，也不随聊天备份导出。

显式配置时，按填写顺序尝试，第一个有效清单为准，不再请求 GitHub。留空时先用原 GitHub Releases API（包括试用 prerelease，跳过 draft），失败后尝试同仓库 main 分支的静态 t-update.json。静态文件部署前可能返回 404，此时仍应显示检查失败，不得显示为已是最新。

接口：info 返回 manifestSources/configurableChannel；setSources 验证后同步持久化；check 使用同一后台工作锁查找清单；download/install 继续使用已有校验。配置、检查、下载、安装的错误带阶段、域名及尝试结果，日志不记录完整自定义 URL。修改配置不读取或修改模型密钥。

## 发布与可达性

清单沿用 schemaVersion、packageName、versionCode、versionName、apkUrl、sha256、sizeBytes、releaseNotes。用 scripts/prepare-update.mjs 从原签名 APK 生成；同一个清单既可作为 Release 附件，也可发布为更新仓库的静态文件。提供备用镜像时，清单和 APK 都需要可达，不能只代理清单。

GitHub 是当前默认渠道；增加 GitHub raw 备用不能保证在无法访问 GitHub 的手机上免 VPN 使用。要实现该目标，需在用户自己控制且手机可达的 HTTPS 服务部署清单和原签名 APK，再填写该地址。本轮没有使用 SullyOS 官方服务、第三方公共代理或硬编码私人服务器。浏览器可以通过代理访问，并不能证明 Android 原生网络已纳入 VPN 分流。

变更清单后必须同步更新静态文件，避免备用渠道滞后。显式选择的清单可信度与其维护者有关；本机仍会拒绝不同包名、不同安装签名及降级 APK。

## 验证与复用

复用 TUpdate 的现有网络、缓存回执、下载与安装代码，复用 app-update 的页面外状态管理；参考 SullyOS utils/androidAppUpdate.ts（da33732253fbf3174bf068a237375155a8d1a846）的直接 HTTPS 清单入口。未引入 SullyOS 源文件或额外原生插件，避免重复下载器和许可混合。

用户于 2026-10-17 确认官方社区公告及作者同意个人非商业二改；该确认不被改写为 MIT/AGPL 授权。未来如实际导入文件，再记录具体版本、授权范围、来源和保留声明；社区截图保留本机，不随源码公开。

Node 测试覆盖地址校验；浏览器测试覆盖配置、失败日志及原下载/安装流程；UpdateChannelInstrumentation 在隔离模拟器验证原生查询、DNS/JSON 失败转移、自定义渠道不依赖 GitHub、配置持久化、包名及地址校验。模拟响应不等于实体手机网络验证。


## 0.7.1 验收记录（2026-10-17）

- 58 项 Node、91 项 Python 检查通过；专用更新浏览器测试覆盖配置、字段回显、敏感参数拒绝、失败阶段日志、下载重试、安装权限返回与缓存恢复。
- 原 API 悬浮球和文字选择/动作模板浏览器回归通过，模拟模型，无付费请求。
- CI 的 Python/Node、密钥扫描、Android 应用与原生测试 APK 构建通过。
- 使用原试用签名，在隔离 Android 11 / WebView 83 模拟器从 0.7.0（9）覆盖安装 0.7.1（10）；完整业务备份相同，原有独立配置文件指纹相同，模型凭据仍存在。未读取实体手机数据。
- UpdateChannelInstrumentation 通过：GitHub DNS 故障转移、自定义渠道不访问 GitHub、DNS/无效 JSON 多入口回退、全失败不误报最新、配置跨插件实例持久化、地址和包名校验。
- 已安装 APK 的真实原生 HTTPS 请求成功读取静态清单开发分支（仍指向已发布 0.7.0），返回无需升级。测试后恢复默认配置；不是对新版本发现或实体手机无 VPN 网络的验收。
- 已安装 APK 的真实长按消息产生系统选字及 Copy 工具栏；桌面右键菜单未拦截 Android 长按。
- APK 与对应源码一起准备；公开 Release、静态 main 分支入口合并和独立无 VPN 托管尚未执行。
