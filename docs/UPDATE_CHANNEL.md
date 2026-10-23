# Android 更新渠道

0.7.1（versionCode 10）保留既有下载、哈希、大小、包名、签名、版本和安装权限检查，增加可配置清单地址。旧 0.7.0 需先手动覆盖安装新版，不能通过网页修改旧 APK 的原生网络逻辑。不要卸载旧版。

## 数据与调用

设置 → 关于与更新 → 更新渠道（高级）。最多三个公开 HTTPS JSON 清单，每行一个；不能放账号、口令、查询参数或模型 API 密钥。配置由 TUpdate 原生插件保存到设备独立 SharedPreferences，不属于人物、聊天或模型配置，也不随聊天备份导出。

显式配置时，按填写顺序尝试，第一个有效清单为准，不再请求 GitHub。0.13.2 起留空时优先读取同仓库 main 分支的静态 t-update.json，有效时只发一次清单请求；失败后使用原 GitHub Releases API（包括试用 prerelease，跳过 draft）。静态文件部署前可能返回 404，此时仍应显示检查失败，不得显示为已是最新。

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

## 0.13.2 更新体验修复（2026-10-23）

职责不变：TUpdate 拥有设备配置、HTTPS、缓存文件、校验和安装；app-update 每个原生插件只维护一个共享任务，页面订阅它的状态。人物、聊天、模型配置和业务数据库没有迁移。原权限引导、取消安装后重开、缓存恢复和手动下载入口保留。

- 默认优先直接清单，失败才扫描 Releases。清单请求的连接/读取超时由 15/30 秒调整为 5/7 秒；所有清单请求共用 20 秒检查预算，避免多个入口逐个耗尽长超时。APK 下载继续用 15/30 秒，避免慢速传输被清单超时误伤。
- 中断或暂停保留 update.part 及其完整清单标识。相同包名、版本、URL、SHA-256 和大小才能续传；206 的 Content-Range 必须与偏移及总大小完全一致；服务器返回 200 时重新写完整文件。换包、范围错误或最终校验失败不会安装。
- 重新打开设置显示同一个任务、百分比、已下载 MB 和当前速度，单次下载只注册一个原生进度监听。校验阶段单独显示，不允许暂停校验。暂停后由用户点击继续；不会自动反复下载。
- 进程重启后读取部分下载元数据，提示继续下载；完整缓存仍需通过原大小、SHA-256、包名、版本和签名检查才能进入系统安装器。

本轮核对 SullyOS `utils/androidAppUpdate.ts`，文件最后修改提交 `4ed3c293af89acf89762a892e72e811017c1b9dc`，blob `15e88dabcb2e5bd36f3d56460eb1aba978b14ff9`。其现成封装依赖 Capacitor Filesystem，主要解决直接清单与跨页面单任务；不包含 HTTP Range 续传。T- 继续复用已有 Java 下载、校验和安装代码，并在该接口内补齐续传；未新增 Filesystem 依赖或导入 SullyOS 文件。个人非商业授权记录仍见上文，不扩展为公开再分发许可。

修复前发布端快照：公开更新仓库仅有 android-v0.7.0 Release，main/t-update.json 返回 404。静态入口需要与审核后的 Release 清单一起部署并持续更新，客户端才会走单请求路径。开发分支、PR 或本地 APK 不会自动更新线上渠道。旧安装包必须覆盖安装一次，才能取得新的原生逻辑。

验证入口：`tests/app-update-browser.mjs` 覆盖导航期间单任务/进度、暂停、重启部分下载和原安装权限/重试；`UpdateTransferInstrumentation` 在独立 Android 11 模拟器用真实文件和模拟 HTTPS 流验证中断、Range、200 回退、范围拒绝、换包隔离与暂停；`UpdateChannelInstrumentation` 验证直接清单只请求一次和 prerelease 回退。没有调用模型服务；真机下载吞吐和免 VPN 可达性未验证。

早期 [直接清单 PR #2](https://github.com/Jcin004/T-companion-updates/pull/2) 只补旧 0.7.0 元数据，现已关闭，由下文完整 0.13.2 同步发布流程替代。新增 `tests/update-ui-android.mjs` 在 Android 11 / WebView 83 实测模块导入、切页单任务、50% 进度和权限返回。

真实网络抽查：独立模拟器把自定义清单临时指向上述 PR 分支，原生 HTTPS 检查一次成功，单次 275 ms、attempts 只有 raw.githubusercontent.com；随后恢复原配置。该结果只验证此网络和已发布 0.7.0 元数据的读取，不代表实体手机耗时或新版 APK 已发布。

## 每个交付版本同步发布

用户于 2026-10-23 确认，每个验证通过的交付版本都发布到手机试用渠道。源码提交/推送、设备验证和试用发布是同一次交付的完成条件。保留产品源码 PR 的人工合并规则；试用包可对应已推送开发提交，Release 正文和清单记录完整 sourceCommit。

流程：完成相关测试 → 提交并推送 → 从该提交构建、用原试用密钥签名 → `git archive` 导出源码 → 准备清单 → 执行发布脚本 → 通过默认原生渠道验证。密钥仍保存在本机忽略目录，不上传到 GitHub Actions。

`scripts/build-web.mjs` 把构建提交写入 APK 内的 source-commit.txt。`scripts/publish-trial.py` 默认只校验；显式 `--publish` 才操作渠道。它核对 APK 包名/版本/签名、大小/SHA-256、构建提交、完整 Git 源码归档及所有前端文件（文本仅忽略 CRLF），并确认源码提交已在 GitHub。发布时先上传完整草稿附件，核对上传摘要，再公开试用 Release，最后写入 main/t-update.json。上传失败不推进清单；重试复用相同附件；拒绝降级或用相同 versionCode 替换不同构建。

以 0.13.2 为例，先设置 JAVA_HOME 指向本机 JDK 21，再运行：

```powershell
git archive --format=zip --output=artifacts/T-companion-0.13.2-source.zip HEAD
node scripts/prepare-update.mjs artifacts/T-companion-0.13.2-trial.apk 20 0.13.2-trial android-v0.13.2
python scripts/publish-trial.py --apk artifacts/T-companion-0.13.2-trial.apk --source artifacts/T-companion-0.13.2-source.zip --manifest artifacts/t-update.json --build-tools C:/path/to/Android/Sdk/build-tools/36.1.0
```

通过校验后，对同一命令增加 `--publish`。运行者负责先完成该版本的测试。发布附件同时包含 APK、匹配源码、LICENSE、THIRD_PARTY_NOTICES、构建说明、SHA256SUMS 和清单。发布只读取 Git 归档和明确指定的安装包、清单，不递归收集运行目录。

从无 .git 的源码包构建时仍可运行 npm build；可通过 T_SOURCE_COMMIT 指定其 Release 记录的提交，否则标记为 unversioned。正式渠道发布仍要求从已提交、已推送的 Git 检出生成并验证。

网络发布顺序、失败保留旧清单、重试幂等和版本冲突由 `backend/tests/test_trial_publication.py` 完全模拟验证。

## 0.13.2 已发布验收（2026-10-23）

- [公开试用 Release](https://github.com/Jcin004/T-companion-updates/releases/tag/android-v0.13.2) 已发布，非草稿。APK、完整源码、许可/署名、构建说明、校验和及清单共七项附件全部完成摘要核对。
- 构建源码提交 `c1ce5395c1b91ca48039ee18c62601f864dec538`，versionCode 20。APK SHA-256 为 `f9cdf7bba344a12093476a4d832fc21b494812aac3f2b21605bd467738974c4e`，80,049,849 字节；源码归档 SHA-256 为 `8c8a96400d2fd7e68752d4bb1e98599862b78513da2ca1a05338e2476a476435`。
- main/t-update.json 已指向该原签名安装包，并记录同一 sourceCommit。匿名 APK HEAD 返回 200，大小正确；Android 默认原生检查一次请求成功，单次 1,287 ms。补齐静态入口前，同一模拟器抽查默认检查为 9,914 ms；这是单次网络样本，不代表真机耗时。
- 原签名旧 0.13.1/code 19 的真实原生更新检查发现 0.13.2/code 20；旧流程该次仍需 12,785 ms。覆盖到新版后，完整合成业务文档（人物、完成聊天、草稿、设置等）及加密凭据保留。未使用实体手机或真实模型。
- 114 Node、103 Python（警告按错误）、专用浏览器和 Android 更新验收通过；[构建提交 CI](https://github.com/Jcin004/T-companion/actions/runs/39833854060) 的测试、密钥扫描、Android 构建全部通过。完整源码包在无 .git 目录中重新构建通过。
- 公开 Release 和清单为本轮交付，后续文档提交只记录实际发布结果；安装包对应的源码始终以清单 sourceCommit 和匹配归档为准。原有未提交的 world-motion-android 测试修改保留在本机，未纳入本轮提交。

## 0.14.1 世界整合版已发布验收（2026-10-23）

- [公开试用 Release](https://github.com/Jcin004/T-companion-updates/releases/tag/android-v0.14.1) 已发布，非草稿。整合世界分支 `12b24ac` 与更新分支 `e52eba7`，使用 versionCode 21，高于两条旧试用路径的 code 20。范围见 [整合说明](RELEASE_0_14_1.md)。
- APK 构建提交为 `7d0b420d3db34848b6d7536683efc1ed8877ee7d`，原包名、原试用签名。APK 80,062,486 字节，SHA-256 `a6febb9a6dc6cc8494f0844a4cbff1510113a9d24da3521518d91346c18dfb2a`；完整源码归档 SHA-256 `364c87257fa62571d960e9fb1227c063018edad2e11e35e87b034f7eaa2b9bee`。七项附件均核对上传摘要，静态 main/t-update.json 指向同一提交与构建，匿名 APK HEAD 返回 200 且大小相符。
- 专用 Android 11 / WebView 83 模拟器的原签名 0.14.0/code 20 从默认渠道发现新版；此次旧流程用时 9,447 ms。真实原生公网下载 137,412 ms，完成大小、SHA-256、包名、版本和签名校验；实际操作安装来源权限和系统安装器，覆盖至 0.14.1/code 21。完整合成人物、聊天、记忆、世界、皮肤与加密凭据文件指纹保持一致。
- 新版默认原生检查用时 2,547 ms，单次直接清单请求，正确显示已是最新。这些是该模拟器、该网络的单次样本，不代表真机耗时或免 VPN 可达性。
- 122 Node、103 Python（警告按错误）通过；更新与世界表情/皮肤/历史浏览器流程通过；UpdateTransfer、UpdateChannel 和旧 WebView 更新 UI 原生检查通过。Gitleaks 和源码快照隐私扫描通过。[构建提交 CI](https://github.com/Jcin004/T-companion/actions/runs/39907301228) 初次因 Chaquopy 依赖下载超时失败，重试后测试、密钥扫描和 Android 构建全部通过。匹配源码包在无 .git 目录中完成网页/后台规则构建。
- 未使用真实人物数据、实体手机或付费模型；原世界说明中的系统选图完整验收和自然后台调度限制保留。发布后的文档提交只记录证据，不替换已发布的 APK 或 sourceCommit。

## 0.15.0 人物图片与行走版（2026-10-23）

[公开试用版](https://github.com/Jcin004/T-companion-updates/releases/tag/android-v0.15.0) 已发布 code23 的原签名 APK、对应提交 `bda26292fd443e22b825a9cb4b29cd0fd6cadf04` 的完整源码及许可等七项附件。默认清单同步，匿名 APK HEAD 200，旧 code22 原生默认检查发现新版，新版原生检查报告已是最新；合成业务文档与凭据指纹在覆盖升级后完整保留。功能、校验和、模拟器验收及系统选图限制见 [0.15.0 验收](SPRITE_WORKSHOP.md)。后续验收文档提交不替换该构建提交。

## 0.16.0 单格小人图片版（2026-10-23）

[公开试用版](https://github.com/Jcin004/T-companion-updates/releases/tag/android-v0.16.0) 发布 code24 原签名 APK、提交 `14e87b92e6b1f75b0c6104320f28ddeb93ad6462` 的匹配源码及许可等七项附件。默认清单同步、匿名 APK HEAD 200，旧 code23 原生检查发现新版，新版报告已是最新。覆盖升级保留完整合成业务数据及加密凭据指纹；系统 PNG 选择返回／保存／重启及 JSON 备份读取通过，模拟器选文件使用原生键盘确认。详细范围、校验和和设备限制见 [单格图片验收](SINGLE_FRAME_SPRITES.md)。
