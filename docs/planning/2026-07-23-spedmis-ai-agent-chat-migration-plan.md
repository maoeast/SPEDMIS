# SPEDMIS AI 智能体与聊天模块迁移实施方案

> 状态：方案已确认，待实施
> 日期：2026-07-23
> 源项目：`E:\VSC\H5\SIC-ADS`（SCGP / 星愿能力发展平台）
> 目标项目：`E:\VSC\H5\SPEDMIS`（特殊教育多模态干预系统）
> 当前唯一实施范围：Phase 1「AI 核心文本聊天」

## 1. 目标

把 SCGP 已验证的 AI 智能体与聊天能力迁移到 SPEDMIS，但不搬运 SCGP 的 Vue、Pinia、Element Plus 或业务数据库。迁移结果应符合 SPEDMIS 当前的原生 HTML、CommonJS Electron Main/Preload 和 `sql.js` 架构，并能继续保持零额外原生依赖。

本次迁移的成功标准：

- SPEDMIS 首页可打开唯一的独立 AI 工作台窗口；
- 用户可配置 DeepSeek 或火山方舟，API Key 只在 Main 进程解密和使用；
- 5 个内置智能体可进行流式文本聊天，会话和 Token 用量可在重启后恢复；
- 首次向外部模型发送内容前必须完成明确的隐私告知确认；
- Renderer 不直接访问数据库、文件系统、网络 Provider 或明文密钥；
- 不影响现有激活、应用启动、IEP、首页模块和使用统计主链；
- `npm test -- --runInBand` 与 `npm run build` 通过，并完成关键人工流程验证。

## 2. 已确认的架构决策

| 主题 | 决策 | 原因 |
| --- | --- | --- |
| UI 技术 | 原生 HTML/CSS/JavaScript，独立 `BrowserWindow` | 适配 SPEDMIS 现有技术栈，不引入 Vue 生态 |
| 业务边界 | Main 进程统一承载数据库、密钥、Provider、提示词拼装与流式调度 | 避免向 Renderer 暴露高权限能力 |
| 数据存储 | 单独使用 `ai-assistant.db` | 不污染激活数据或 `usage-stats.db` |
| 本地身份 | 固定 `owner_key='local-os-profile'` | SPEDMIS 当前没有教师账号体系，同时为以后账号映射留接口 |
| 密钥存储 | Electron `safeStorage` 加密后持久化；无明文降级 | API Key 不进入 HTML、日志、普通配置或数据库明文字段 |
| Provider | 首批支持 DeepSeek、火山方舟的 OpenAI 兼容接口 | 源模块已有稳定的请求、SSE 和错误映射经验 |
| 内置内容 | 迁移 5 个智能体；Phase 2 再迁移 7 个知识技能及 14 份引用 | 先闭环低风险文本聊天，再扩大上下文治理范围 |
| 历史数据 | 不迁移 SCGP 历史会话、附件和 API Key | 避免跨产品隐私、密钥与身份归属问题 |
| 工具能力 | Phase 1 不接工具；Phase 3 只提供 SPEDMIS 只读工具 | 避免 AI 自动启动程序或越过现有权限边界 |
| 文档附件 | 首批不支持 PDF、Word、Excel | SPEDMIS 的 Electron 23 / Node 18 与 SCGP 当前 PDF 依赖要求不兼容 |

## 3. 当前基线与施工边界

### 3.1 源项目可复用能力

SCGP 已有以下可参考实现：

- Provider 请求、SSE 流解析、超时、取消和错误分类；
- `safeStorage` 密钥处理；
- AI 表结构、会话消息、Token 账本和月度额度；
- 5 个教师工作场景智能体；
- 7 个知识技能、14 份 references 和技能绑定；
- Markdown 展示、附件生命周期、视觉能力校验和工具循环。

迁移原则是复用领域规则和测试经验，不直接复制 Vue Store、组件或依赖 SPEDMIS 不具备的 SCGP 数据接口。

### 3.2 目标项目约束

- Electron `^23.0.0`，运行时基于 Node 18；
- UI 以原生 HTML/JavaScript 为主；
- 数据层已使用 `sql.js`，不得新增 `sqlite3`、`better-sqlite3` 等原生依赖；
- Main 入口集中在 `main.js`，Preload 为 `preload.js`；AI 窗口应使用独立、最小化的 `ai-preload.js`；
- 打包 `files` 当前会包含根目录 `*.html`、`*.js`、`images/**/*` 和 `*.json`，新增子目录代码时必须同步确认打包收集规则；
- 当前工作区已有未提交用户改动，必须保留：
  - `test/activation-status.test.js`
  - `test/home-modules.test.js`
  - `test/iep-shell.test.js`

其中 `test/activation-status.test.js` 可能与 `main.js` 的 AI 接入测试同时涉及入口结构，实施时必须协作修改，不得覆盖或还原现有断言。

## 4. 迁移范围

### 4.1 纳入范围

Phase 1：

- 首页 AI 入口和独立 AI 窗口生命周期；
- 最小权限 AI Preload 与显式 IPC 契约；
- 独立 AI 数据库、schema 版本和原子持久化；
- DeepSeek、火山方舟配置、连通性测试和流式文本请求；
- `safeStorage` API Key 保存、更新、清除和配置状态展示；
- 5 个内置智能体；
- 会话创建、切换、重命名、删除及历史消息；
- Markdown 安全渲染、流式停止、错误恢复；
- 首次外发隐私告知；
- Token 用量统计、月度额度提示和可选硬截断；
- 自动测试、打包验证和人工验收。

Phase 2：

- 7 个知识技能和 14 份引用；
- 内置智能体启停；
- 自定义智能体增删改；
- 智能体与知识技能绑定；
- 提示词版本、来源、许可证和升级策略。

Phase 3：

- 图片附件导入、受控存储、清理和视觉模型能力校验；
- 只读查询 SPEDMIS 干预应用目录；
- 只读查询聚合使用统计；
- 工具循环、参数校验、超时与结果裁剪。

### 4.2 明确不纳入

- Vue、Pinia、Element Plus 及 SCGP 的页面路由；
- SCGP 用户、学生、评估、训练、报告或资源数据库；
- SCGP 历史会话、附件、API Key 与个人数据；
- AI 自动启动本地程序、返回本地程序路径或执行写操作；
- Phase 1 的图片、PDF、Word、Excel 等附件；
- 为迁移顺手重构 SPEDMIS 现有 Main、Preload 或全站 UI；
- 未经明确要求的提交、推送或安装包发布。

## 5. 目标架构

```text
SPEDMIS 首页
    |
    | 打开唯一实例
    v
AI BrowserWindow (ai-assistant.html/css/js)
    |
    | window.aiAPI，仅白名单方法
    v
ai-preload.js
    |
    | invoke + requestId 作用域流事件
    v
Main AI Service
    +-- AI Database ------ userData/ai-assistant.db
    +-- Secret Store ---- safeStorage + 加密载荷
    +-- Agent Catalog --- 5 个内置智能体及版本
    +-- Prompt Builder -- 系统提示词 + 有界历史
    +-- Budget Service -- 月度 Token 账本/额度
    +-- Provider Adapter - DeepSeek / 火山方舟
                              |
                              v
                         HTTPS 模型服务
```

关键边界：

- `contextIsolation: true`、`nodeIntegration: false`、关闭不必要的导航和新窗口；
- Main 校验 IPC 调用方确实来自 AI 窗口；
- Renderer 只收到 `hasApiKey` 等状态，不收到密文或明文 Key；
- 流事件必须携带 `requestId`、`conversationId`，避免并发串流；
- 关闭窗口、切换会话或点击停止时必须中止对应请求并清理监听器；
- Provider Base URL 只接受 `https:`，默认使用固定官方端点；自定义地址需要明确校验；
- 日志不得记录 Key、完整请求正文、学生可识别信息或 Provider 原始响应正文。

## 6. Phase 1 详细实施计划

### 6.1 工作区保护与基线

1. 读取 `.continue-here.md` 和本方案；检查分支、status、stash、最近 5 个提交。
2. 单独查看 3 个未提交测试文件的 diff，确认其现有意图。
3. 运行迁移前测试基线；若已有失败，记录为基线而不是顺手修复。
4. 后续只改 AI 接入必需文件；发现同文件冲突时保留用户改动并追加最小修改。

### 6.2 模块拆分

建议结构如下，实施时可按现有命名习惯微调，但不得把全部 AI 逻辑继续堆进 `main.js`：

```text
ai-assistant.html
ai-assistant.css
ai-assistant.js
ai-preload.js
modules/
  ai-database.js
  ai-secret-store.js
  ai-provider-client.js
  ai-agent-catalog.js
  ai-prompt-builder.js
  ai-service.js
test/
  ai-database.test.js
  ai-secret-store.test.js
  ai-provider-client.test.js
  ai-ipc-contract.test.js
  ai-window.test.js
```

`main.js` 只负责创建窗口、注册/注销 AI IPC 和应用退出清理；数据库、Provider 与业务编排放在 `modules/` 中。新增文件后检查 `package.json > build.files`，确保生产包实际包含 AI 运行文件。

### 6.3 AI 数据库

数据库路径使用 `path.join(app.getPath('userData'), 'ai-assistant.db')`。建议 Phase 1 最小表：

| 表 | 用途 | 关键字段/约束 |
| --- | --- | --- |
| `ai_schema_meta` | schema 版本 | 单行版本或迁移记录 |
| `ai_agent` | 内置智能体快照 | 稳定 code、版本、启用状态、提示词、排序 |
| `ai_provider` | 非敏感 Provider 配置 | code、base URL、model、enabled、`has_key` 状态；不得存明文 Key |
| `ai_conversation` | 会话 | id、owner_key、agent_code、title、created_at、updated_at |
| `ai_message` | 消息与 Token 明细 | conversation_id、role、content、status、prompt/completion/total tokens、error_kind |
| `ai_monthly_usage` | 快速额度汇总 | owner_key、month、各类 token、request_count；可由消息账本校验 |
| `ai_preference` | 本地偏好 | owner_key、隐私确认时间、当前 Provider、月额度、硬截断开关 |

实现要求：

- 所有用户数据查询都带 `owner_key='local-os-profile'`；
- 使用参数化 SQL，Renderer 不传任意 SQL；
- 初始化和升级必须可重复执行，内置智能体用稳定 code + 内容版本幂等同步；
- 写入后防抖/串行导出数据库，并通过临时文件 + 原子替换持久化；
- 应用退出前 flush；保存失败要向调用方返回可理解错误，不得只写日志；
- 删除会话时事务性删除关联消息；失败不得留下半状态。

### 6.4 密钥与 Provider 配置

- 用 `safeStorage.encryptString()` 加密 Key，持久化加密载荷；解密仅发生在 Main 请求前；
- `safeStorage.isEncryptionAvailable()` 为 false 时禁止持久化 Key，并显示明确错误，不允许明文降级；
- 提供保存、覆盖、清除、测试连接四种操作；UI 只显示已配置/未配置；
- DeepSeek 默认 Base URL：`https://api.deepseek.com`；
- 火山方舟默认 Base URL：`https://ark.cn-beijing.volces.com/api/v3`，模型值由用户填写接入点 ID；
- 模型 ID 属于可配置数据，不把短期模型名散落在 UI 和请求代码中；
- 请求超时默认 60 秒，错误至少区分：未配置 Key、鉴权失败、余额/额度、限流、超时、网络、服务端、响应格式和用户取消；
- 连通性测试只返回分类结果，不回显 Key 或完整响应。

此前对两个官方端点进行无凭据探测均返回预期 `401`，说明网络路径可达；这不替代使用真实 Key 的人工验收。

### 6.5 5 个内置智能体

Phase 1 迁移以下稳定 code 和教师场景：

| code | 展示名 | 定位 |
| --- | --- | --- |
| `special_ed_teacher` | 一人一策 | 个别化教学与训练设计 |
| `scgp_builtin_communication_support` | 沟通有方 | 课堂沟通支持 |
| `scgp_builtin_growth_observer` | 成长看得见 | 客观观察和变化追踪 |
| `scgp_builtin_family_communication` | 家校好好说 | 家校沟通草拟 |
| `scgp_builtin_wellbeing_support` | 心晴陪伴 | 情绪支持和危机边界 |

迁移时必须：

- 将提示词中的 SCGP 产品名改为 SPEDMIS 的中性教师工作台语境；
- 删除或改写 Phase 1 不存在的学生、评估、训练、报告工具调用指示；
- 保留不诊断、不替代专业服务、危机处置、最小必要信息和客观事实等安全边界；
- 保留来源、许可证、内容版本元数据，为 Phase 2 知识技能同步做准备；
- Phase 1 内置角色只读，不提供编辑；启停和自定义角色放到 Phase 2。

### 6.6 IPC 契约

建议使用以下语义化通道；最终名称可调整，但 Preload 暴露面必须保持同等收敛：

| 类别 | IPC | 行为 |
| --- | --- | --- |
| 启动 | `ai:bootstrap` | 返回角色、非敏感配置、用量、隐私状态 |
| Provider | `ai:provider:save/test/clear` | 保存非敏感配置与 Key、测试、清除 |
| 会话 | `ai:conversation:list/create/rename/delete` | 管理当前 owner 的会话 |
| 消息 | `ai:message:list` | 分页读取会话消息 |
| 聊天 | `ai:chat:start/cancel` | 启动或中止请求，返回 requestId |
| 流事件 | `ai:chat:delta/done/error` | 按 requestId 推送增量、完成、错误 |
| 隐私 | `ai:privacy:accept` | 记录版本化确认时间 |
| 额度 | `ai:budget:update` | 更新月度 Token 额度和硬截断开关 |

每个输入都需要 schema/类型、长度、枚举和所有权校验。Preload 的事件订阅方法必须返回 unsubscribe 函数，不得让 Renderer 调用任意 channel，也不得使用无限制 `removeAllListeners()` 影响其他窗口。

### 6.7 聊天编排与流式持久化

1. 发送前确认隐私版本、Provider、Key、模型、角色和额度状态。
2. 在数据库先写入用户消息及 pending assistant 消息，形成可恢复状态。
3. Main 根据角色提示词和有界会话历史构造请求；Phase 1 不注入知识技能和业务数据。
4. Provider Adapter 解析 OpenAI 兼容 SSE，增量仅按 requestId 发给发起窗口。
5. 完成后一次性持久化 assistant 正文、Token usage 和状态，再更新月度账本。
6. 取消、超时或网络失败时保留用户消息，将 assistant 标记为 cancelled/error，并允许重试。
7. 对不返回 usage 的流式响应明确记录未知/估算状态，不伪造精确 Token。

默认沿用源模块的月度额度策略：`10,000,000` Tokens、默认只提示不硬截断；用户开启硬截断后，在发起请求前拦截超额调用。额度是成本保护，不是授权系统。

### 6.8 AI 工作台 UI

第一屏直接是可用工作台，不做宣传页。建议布局：

- 左侧：新建会话、历史会话列表、重命名/删除；
- 中间：当前智能体、消息流、停止/重试、输入框和发送；
- 右侧或设置面板：Provider、模型、Key 状态、连接测试、月额度与用量；
- 首次发送：阻断式隐私告知，说明文本会发送到所选第三方 Provider，不默认发送 SPEDMIS 本地业务数据；
- 空状态：显示 5 个角色及各自的开场问题；
- 错误状态：就地显示可行动错误，不以控制台信息代替用户反馈。

Markdown 必须经过安全解析/清洗，禁用原始 HTML、脚本、事件属性和危险 URL。外链通过受控 Main 接口打开，并校验 `https:`；代码块、长单词和流式内容不得撑破窗口。

### 6.9 首页接入

- 按 SPEDMIS 现有首页模块数据和命名机制增加 AI 入口，不改写模块体系；
- AI 窗口保持单例，重复点击聚焦已有窗口；
- 主窗口关闭或应用退出时正确取消进行中的 AI 请求并关闭数据库；
- AI 功能故障不能阻止主窗口启动；初始化失败应只让 AI 入口显示明确错误；
- 与激活状态和权限逻辑保持现状，Phase 1 不自行发明新的授权判定。

### 6.10 验证与验收

自动测试至少覆盖：

- 数据库首次创建、重开持久化、schema 幂等迁移、owner 隔离和级联删除；
- 5 个内置智能体幂等同步及去 SCGP 品牌/去不可用工具断言；
- `safeStorage` 可用、不可用、加密/解密失败和日志无密钥；
- 两个 Provider 的请求映射、SSE 分片、非流式错误、超时、取消和 usage 解析；
- 隐私未确认时拒绝发送；
- Token 汇总、月切换、提示和硬截断；
- IPC 调用方、参数、owner、requestId 隔离和监听器清理；
- AI 窗口单例、配置安全项和首页入口；
- 现有激活、首页模块、IEP 和使用统计测试不回归。

完成命令：

```powershell
npm test -- --runInBand
npm run build
git diff --check
git status --short --branch
```

人工验收：

1. 无 Key 时能打开工作台，但发送被明确阻止。
2. 保存 Key 后重启应用，UI 只显示“已配置”，源码/日志/数据库中没有明文 Key。
3. 首次发送先出现隐私告知，拒绝时不发网络请求。
4. DeepSeek 和火山方舟至少各用一个真实配置完成连接测试；正式聊天至少验收当前实际使用的 Provider。
5. 流式内容持续显示，停止后不再追加；切换会话不会串流。
6. 新建、重命名、删除、重启恢复均符合预期。
7. Token 用量更新，额度提示和硬截断可复现。
8. Markdown 中的脚本、危险链接和原始 HTML 不执行。
9. 打包安装后的 AI 入口、Preload、模块和数据库初始化正常。

## 7. Phase 2 计划：知识与智能体治理

Phase 1 验收后再实施，预计 2–3 个工作日。

- 迁移 7 个技能：`special-education-teacher`、`speech-therapist`、`developmental-screening-assessment`、`inclusive-training-adaptation`、`montessori-teacher`、`child-adolescent-mental-health-support`、`家校沟通话术官`；
- 迁移 14 份 references，并保留来源、许可证、版本和适用边界；
- 建立技能、引用、智能体绑定表，按绑定精确注入，不默认把全部知识加入每次请求；
- 对注入字符数、引用数和上下文 Token 设硬上限，并显示截断状态；
- 内置智能体允许启停但不允许删除；自定义智能体支持增删改和技能绑定；
- 升级内置内容时按 code + content_version 幂等更新，不覆盖用户自定义内容；
- 增加知识溯源、提示词快照和注入顺序测试。

Phase 2 验收标准：7 个技能和 14 个引用可追溯、绑定可控、上下文有界，自定义角色不影响内置角色升级。

## 8. Phase 3 计划：图片视觉与 SPEDMIS 只读工具

Phase 2 验收后再实施，预计 2–3 个工作日。

- 图片只复制到 AI 专属受控目录，数据库仅存相对路径、MIME、大小、哈希和生命周期状态；
- 校验扩展名、MIME、魔数、尺寸和总量；删除消息/会话时回收孤儿文件；
- 发送图片前校验当前模型支持视觉；不支持时在本地阻止；
- 工具 1：按业务字段查询可用干预应用，返回名称、分类和说明，不返回磁盘路径；
- 工具 2：查询聚合使用统计，只返回必要汇总，不返回可识别明细；
- 工具参数使用白名单 schema，Main 执行，只读、限时、限行、结果裁剪并记录审计；
- AI 不得调用现有启动应用 IPC，不得把工具输出升级为写操作。

Phase 3 验收标准：图片可控存取且无孤儿泄漏，工具无法取得路径或执行程序，提示词注入攻击不能越过工具白名单。

## 9. 延后项

PDF、Word、Excel 文档解析不属于前三阶段。若后续需要，应先单独决策：

1. 升级 Electron/Node 运行时并评估全项目回归；或
2. 选择兼容 Node 18、无额外原生依赖且许可证合适的解析方案。

不得为了附件能力直接复制 SCGP 的 `pdfjs-dist@6.1.200`，该版本要求 Node `>=22.13`，与 SPEDMIS 当前运行时不匹配。

## 10. 风险与控制

| 风险 | 控制措施 |
| --- | --- |
| `main.js` 继续膨胀 | AI 领域逻辑拆到 `modules/`，Main 只做装配和生命周期 |
| API Key 泄漏 | safeStorage、无明文降级、状态化响应、日志脱敏、专项测试 |
| SQL.js 保存丢失/竞争 | 串行写、原子替换、退出 flush、失败可见、重开测试 |
| SSE 串流或监听器泄漏 | requestId 路由、单请求 AbortController、unsubscribe、并发测试 |
| Markdown XSS | 禁原始 HTML、安全清洗、危险 URL 拦截、攻击样例测试 |
| Prompt 携带旧产品能力 | 去 SCGP 品牌、移除不可用工具、快照测试 |
| 成本失控 | 月度 Token 账本、可见额度、可选硬截断、超时与上下文上限 |
| 现有功能回归 | 保护 3 个未提交测试改动，跑全量 Jest 和生产构建 |
| 打包漏文件 | 检查 `build.files`，从安装包执行人工验收 |
| 运行时不兼容 | Phase 1 只用 Node 18/Electron 23 可用 API，不引入原生依赖 |

## 11. 阶段门禁

- Phase 1 未通过自动测试、真实 Provider 验收和安装包验证，不进入 Phase 2；
- Phase 2 未证明知识注入有界且来源可追溯，不进入 Phase 3；
- 每阶段结束更新 `.continue-here.md`，明确已实现、未实现和下一原子动作；
- 每阶段只在用户明确要求时提交或推送；
- 遇到需修改激活、权限、应用启动协议或升级 Electron 的情况，视为范围扩大，先暂停说明。

## 12. 参考文件

源项目：

- `E:\VSC\H5\SIC-ADS\electron\handlers\ai.mjs`
- `E:\VSC\H5\SIC-ADS\electron\handlers\ai-secrets.mjs`
- `E:\VSC\H5\SIC-ADS\src\database\ai-api.ts`
- `E:\VSC\H5\SIC-ADS\src\database\init.ts`
- `E:\VSC\H5\SIC-ADS\src\stores\ai.ts`
- `E:\VSC\H5\SIC-ADS\src\data\ai-agent-presets.ts`
- `E:\VSC\H5\SIC-ADS\src\data\skills\`
- `E:\VSC\H5\SIC-ADS\src\features\ai\`

目标项目：

- `E:\VSC\H5\SPEDMIS\main.js`
- `E:\VSC\H5\SPEDMIS\preload.js`
- `E:\VSC\H5\SPEDMIS\config.js`
- `E:\VSC\H5\SPEDMIS\modules\usage-stats.js`
- `E:\VSC\H5\SPEDMIS\package.json`
- `E:\VSC\H5\SPEDMIS\test\`
