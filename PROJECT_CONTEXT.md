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
- Dev 约束：Ctrl+R 仅重载渲染层；主进程模块（main.js、modules/ai-*.js、preload.js、ai-preload.js）改动需整启 app 才生效，否则表现为「功能失效/数据丢失」（曾导致接入点丢失误报）。
