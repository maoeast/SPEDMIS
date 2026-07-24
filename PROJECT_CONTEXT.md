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
