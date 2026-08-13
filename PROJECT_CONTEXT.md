## 2026-05-15
- 新增首页入口配置层：`config.js` + `modules/entry-module-manager.js`，配置文件持久化到 `AppData/.../config/entry-module.json`。
- 首页第六模块改为由 `selectedModule`（`psy` / `iep` / `none`）驱动，组合逻辑抽到 `modules/home-modules.js`。
- 新增 `iep-open-window` Electron 入口，直接加载本地 `iep/index.html`；`AI心理测验` 仍保持 `psy-login.html` 独立窗口模式。

## 2026-05-15
- IEP ��ڸ�Ϊ˫��ṹ��iep/index.html �� Electron ��ҳ��iep/embedded-entry.html ����ԭҵ��ҳ��ͨ�� webview ��Ƕ��
- IEP ��ҳֻ�������½�����������ť��������������״̬�������Ƴ��������ڵ�ҵ�����ݡ�
- IEP �������ڱ������� webviewTag: true����ҳĬ����ڸ�Ϊ selectedModule = 'iep'�����ѳ־û��� psy ѡ���Զ�Ǩ�ơ�

## 2026-07-24
- 新增独立 SPEDMIS AI 教师工作台：原生 HTML + CommonJS Electron Main/Preload，AI 数据独立存放于 sql.js 数据库；不引入 Vue、Pinia、Element Plus 或额外原生依赖。
## 2026-07-24 Phase 2
- AI 工作台 Phase 2「知识与智能体治理」：迁移 7 个知识技能 + 14 份引用（内联为 modules/ai-skill-catalog.json，非 .md）；schema 升至 v3，新增 ai_skill/ai_agent_skill 表与 ai_message 知识快照/provenance 列；按绑定精确注入并设字符/技能/引用数硬上限 + 结构化截断标记；内置技能 content_version 版本门控幂等升级、绑定 seed ON CONFLICT DO NOTHING；智能体治理（内置启停、自定义增删改 + 技能绑定、重置内置绑定）。AI 套件 63/63 通过，构建成功，无 .md 出货。
## 2026-07-25 Phase 3
- AI 工作台 Phase 3「图片视觉与只读工具」：schema 升至 v4，新增 ai_tool_call 审计表与 ai_attachment 表、ai_agent.tools_enabled、ai_provider.supports_vision 列。两个只读工具（查询干预应用目录、查询聚合使用统计）按 agent 开关启用、Main 执行、有界非流式循环、手写 schema 校验 + 逐工具超时 + 结果脱敏 + 字段投影（剥离路径）。图片附件全 rigor 校验（扩展名/MIME/魔数/尺寸/大小）+ sha256 + 受控存储 + 视觉门控（provider 级 supports_vision，默认关，本地拦截）+ 删会话回收孤儿。AI 套件 89/89 通过，构建成功，无 .md 出货。
## 2026-07-26 Phase 5
- AI 工作台 Phase 5「provider 多接入点 + 系统维护可见性开关」：schema 升至 v5。ai_provider 增 endpoints_json（多接入点/模型 ID 列表，活动接入点即 model，旧单 model 字段兼容回退）；ai_preference 增 knowledge_section_visible（休眠，面板不再读写）。DeepSeek 官方渠道下线、偏好回退火山方舟。「智能体管理 / 知识技能 / 本月额度」三块默认隐藏，收口到 首页→高级设置→系统维护 的系统级开关（config.js → ai-feature-flags.json，FLAG_KEYS 集合 + merge 写入；主应用 preload.js electronAPI.getAiFeatureFlags/setAiFeatureFlags 透传），AI 面板只读反映 state.features。AI 助手从首页模块网格移出，改右下浮动按钮（FAB）。已提交推送：cefb692、2db5923。

## 2026-07-26 Phase 5 收尾
- 服务设置去标题、火山方舟默认接入点（`668a7a2`）；左侧会话栏精简——移除重命名入口、加会话分隔线、去顶部 provider 状态（`c60c645`）。
- 流式回复超时语义从「60s 总超时」改为「空闲超时」：`createRequestController` 增 `resetTimeout`，响应头与每段数据到达时重置计时，模型持续产出不再被误杀；`completeChat`/`testConnection` 保持总超时；按 `wasStreaming` 区分文案（产出停滞提示"模型响应停滞，请稍后重试。"，`17202a0`）。
- 模型与额度面板视觉层级调整：保存按钮 teal 确认色、破坏操作 ghost 化、接入点两行布局 + teal 强调（`64e5677`）。

## 2026-07-29 发布 1.2.2
- 首页版权统一为 ©2013-2026 杭州炫灿科技（修正遗留炬星占位与年份，`e6efa52`、`112ed37`）。
- 版本号升至 1.2.2（`f692a55`）；psyseen 外部登录失败上报修复（`7e6100e`）。

## 开发约束（通用）
- Ctrl+R 仅重载渲染层；主进程模块（main.js、modules/ai-*.js、preload.js、ai-preload.js）改动需整启 app 才生效，否则表现为「功能失效/数据丢失」（曾导致接入点丢失误报）。

## 2026-08-13 激活升级（密钥轮换 + .lis 激活文件）
- ACTIVATION_SECRET_KEY 轮换为 48 字符随机密钥：`embedded-secrets.js`、`tools/特殊教育多模态干预系统激活安全密钥.txt` 同步更新；加密密钥（ENCRYPTION_KEY/IV）不动，已激活机器不受影响（激活状态校验只比对存储机器码，不重算 HMAC）。旧激活码作废，换机/重装需重新发码。
- 新增激活文件（.lis）体系：`modules/activation-lis.js` 单一实现构建/解析（v1 格式：machineCode/activationCode/issuedAt；容错 BOM/CRLF/注释/大小写）；主进程 IPC `parse-activation-lis`（config.js 通道 + preload.js API）。
- 激活页面新增「导入激活文件(.lis)」入口：选择文件 → 解析 → 校验文件机器码与当前机器一致 → 自动填入激活码并提交激活。
- 工具导出：CLI 新增 `--export-lis` / `--lis-output` + 交互模式生成后询问导出（单个/批量）；GUI 单个与批量结果新增「导出激活文件(.lis)」按钮（server 新增 `/api/lis-content`）。
- 测试：新增 `test/activation-lis.test.js` 15/15 通过；全量 34/39 套件（5 个 EPERM 路径环境性问题与本次改动无关）。

## 2026-08-13 激活工具 GUI v2.0
- `tools/activation-tool-gui.html` 全面重设计：品牌蓝视觉（与主应用激活页一致）、现代卡片布局、响应式、5 页签（单个生成 / 批量生成 / .lis 验证 / 验证激活码 / 生成器状态）。
- 新增「.lis 验证」页签：拖拽或选择 .lis 文件 → `/api/lis-parse` 解析（显示机器码/激活码/签发时间）→ 一键校验激活码有效性（分发前自检）。
- 批量页新增「📦 导出全部 .lis（ZIP）」：`tools/activation-zip.js` 为无依赖 STORE 模式 zip 生成器（表驱动 CRC32，标准校验值验证），`/api/lis-zip` 打包下载。
- server 新增 API：`/api/lis-parse`、`/api/lis-zip`。
- 测试：`test/activation-zip.test.js` 6/6（含标准 CRC32 校验值 0xCBF43926 与 zip 结构 round-trip 解析）；server 端到端 5/5；全量 35/40 套件（5 个 EPERM 环境性问题与本次无关）。

## 2026-08-13 激活工具 GUI v2.1（单文件版）
- 用户要求「单个 HTML 即可生成激活码」：`tools/activation-tool-gui.html` 改为**纯前端单文件版**，双击打开即用、零服务器依赖。
- 内嵌核心逻辑：HMAC-SHA256（Web Crypto `crypto.subtle`，与主应用算法一致）、.lis 构建/解析、无依赖 STORE 模式 ZIP 打包（前端 CRC32）、CSV 批量解析；密钥默认内置（与 embedded-secrets.js 一致），可在「生成器状态」页修改并持久化到 localStorage。
- 全部计算在本机浏览器完成，无任何网络请求；`activation-tool-server.js` 保留为可选的服务器模式（密钥存服务器端）。
- 测试：新增 `test/activation-frontend-core.test.js` 17/17（jest + vm 提取 HTML 内嵌脚本，验证 HMAC 与 Node crypto 对等、已知激活码向量、.lis 往返、zip round-trip、CSV 解析）。
- 顺手修复：`test/product-name-manager.test.js` 版权断言 ©2013-2025 → ©2013-2026（e6efa52 提交时测试漏更新）。
- 全量 37/41 套件（4 个 EPERM 环境性问题为预存，与本次无关）。

## 2026-08-13 tools 目录清理
- 按用户要求删除冗余：服务器模式整组（`activation-tool-server.js`、`activation-zip.js`、`tools/package.json`、`tools/node_modules/`、`test/activation-zip.test.js`）——GUI v2.1 单文件化后 server 为冗余路径；`gen-skill-catalog.cjs`（一次性未跟踪生成器，Phase 2 使命完成）。
- 同步清理引用：`tools/README.md`（文件结构/FAQ/示例 3 改单文件模式）、`tools/QUICKSTART.md`（方式 2/排查/日常使用）、`modules/activation-lis.js` 注释、`modules/ai-skill-catalog.js` 注释（标注生成器已归档）、`系统参数技术文档.md` 相关文件列表。
- 保留：`activation-code-generator.js`、`activation-tool-cli.js`、`activation-tool-gui.html`、`test-activation-generator.js`、`README.md`、`QUICKSTART.md`、`特殊教育多模态干预系统激活安全密钥.txt`（运维密钥配置）。
- 全量 36/40 套件（4 个 EPERM 环境性问题为预存，与本次无关）；旧 3000 端口 server 进程已停止。

## 2026-08-13 分批提交
- 分 3 个提交推送工作区：`8ef7c4f` docs（AGENTS.md 补全 + 文档清理）、`212eed9` feat(activation)（密钥轮换 + .lis + GUI v2.1）、`d2f382d` fix(test)（版权断言）。

## 2026-08-13 用户操作手册重写（真实截图）
- 按用户要求重写 `系统使用说明书.md`（566 行 → 202 行）：**移除安装与激活步骤**，聚焦已激活用户的日常操作；新增真实 UI 截图 7 张（images/screenshots/）。
- 截图方案：临时 Electron 脚本（.tmp/capture-screens.js 保留备用）+ 最小 IPC stub（真实 apps.json 聚合分类、真实内置智能体、默认配置）+ 本地 HTTP 静态服务器 + capturePage；踩坑记录：Electron 23 同进程第二个 BrowserWindow 加载必失败（改用单窗口顺序导航）、真实 preload.js 与 query URL 冲突（改用极简 stub preload）、ai 通道需 {success,data} 包装（与 ai-ipc.js 一致）。
- 手册章节：主界面 / 模块导航 / AI 教师工作台（5 智能体）/ AI 心理测评 / 高级设置 / 使用统计 / 用户中心 / FAQ（无安装激活内容）。

## 2026-08-13 手册补全综合测评领域（IEP）
- 按用户要求补全「综合测评领域」：截图脚本启用 webviewTag 截取 `iep/index.html`（webview 内嵌 embedded-entry.html），iep.png 为真实「资源教室管理系统-IEP」登录页（DOM 验证通过：标题/登录表单/页脚）。
- 手册新增第 4 章「综合测评领域（IEP）」（入口、导航按钮、登录流程、标题同步说明），后续章节顺延为 5-10；docx 重新生成（105 段 / 8 图 / 3 表）。

## 2026-08-13 docx 封面与封底
- 按用户要求参考「企业文档封面模板.docx」为说明书添加封面/封底：A4 三节结构（封面节无页脚 / 正文节居中页码 / 封底节无页脚）。
- 封面：Logo（images/logo.png）+ 品牌蓝大标题 + 副标题 + 英文副标题 + 分隔线 + 版本信息（v1.1.0 / SPEDMIS v1.2.2 / 2026-08-13）+ 公司信息；封底：Logo + 系统名 + 联系信息 + 版权。
- 正文 8 张截图 + 封面/封底 2 张 Logo = 10 图；转换脚本 .tmp/md2docx.py 更新（含页码域），验证通过。
