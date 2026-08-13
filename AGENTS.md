# AGENTS.md — SPED_MIS Project Guide

## 项目概述

**SPEDMIS（特殊教育多模态干预系统）**：基于 Electron 的 Windows 桌面应用，集中展示、分类和启动特殊教育多模态干预工具，并提供 AI 教师工作台、AI 心理测评、IEP 个别化教育计划等能力。目标平台为 Windows 桌面环境。

## 技术栈

- **运行时**：Electron 23 / Node.js（CommonJS，无 TypeScript、无前端框架）
- **界面**：原生 HTML5 + CSS3 + Vanilla JS（Font Awesome 7、Chart.js 3）
- **数据**：sql.js（SQLite WASM）；AI 套件独立库 `ai-assistant.db`
- **测试**：Jest 29（`test/` 目录）
- **构建**：electron-builder 26（NSIS，x64，输出 `dist/`）

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm start` | 开发模式启动 Electron（`NODE_ENV=development`） |
| `npm run prebuild` | 生成 `embedded-secrets.js`（生产密钥注入，文件不入库） |
| `npm run build` | 生产构建（自动执行 prebuild 后 electron-builder） |
| `npm run rebuild` | 重建原生依赖 |
| `npm test` | 全量 Jest 测试 |
| `npm run test:watch` / `npm run test:coverage` | 监听模式 / 覆盖率 |
| `npm run predeploy` | 测试 + 部署前检查脚本 |

## 编码约定

- **架构约束**：不引入 Vue / React / Pinia / Element Plus 等框架；UI 原生实现，AI 套件保持零额外原生依赖
- **分层**：业务逻辑放 `modules/`（CommonJS 单文件模块）；`main.js` 只做装配、生命周期与 IPC 注册；`preload.js` / `ai-preload.js` 通过 contextBridge 暴露最小 API（Renderer 不直接访问数据库、文件系统、网络 Provider 或明文密钥）
- **命名**：文件 kebab-case（如 `ai-provider-client.js`）、函数/变量 camelCase、常量 UPPER_SNAKE_CASE；IPC 通道常量集中在 `config.js`
- **错误处理**：主进程模块抛错带上下文；日志统一走 `logger.js`（`getLogger('TAG')`）；密钥、API Key 等敏感信息不得落日志
- **测试**：新模块配套 `test/<module>.test.js`；AI 套件命名 `test/ai-*.test.js`；提交前至少运行一次 `npm test`
- **提交**：Conventional Commits（`feat`/`fix`/`chore`/`docs`/`refactor` + scope，中文描述）
- **文档**：交付日志写 `PROJECT_CONTEXT.md`；开发交接写 `.continue-here.md`；安装包不携带 .md（打包已排除 `**/*.md`）

## 架构说明

- **激活体系**：`hardware.js` 硬件指纹 → `machine-code-manager.js` 机器码 → `activation-crypto.js`（HMAC-SHA256 激活码 + AES-256-GCM 加密存储），`vm-detector.js` 虚拟机检测；密钥经 `embedded-secrets.js` / 环境变量注入，`secret-manager.js` 读取；`.lis` 激活文件（`modules/activation-lis.js` 构建/解析）支持工具导出、激活页一键导入
- **配置**：`config.js` 统一定义默认值与 IPC 通道；运行时配置持久化到 `%APPDATA%/特殊教育多模态干预系统/config/`（如 `entry-module.json`、`ai-feature-flags.json`）
- **首页**：`index.html` 按 6 大领域 + 可选模块（`psy` / `iep`）渲染应用卡片（`apps.json` 元数据，`modules/home-modules.js` 组合），AI 助手为右下浮动按钮（FAB）打开独立窗口
- **AI 教师工作台**：`ai-assistant.html/js/css` + `ai-preload.js`；数据库 `modules/ai-database.js`（schema v5，会话/消息/Token 账本/技能/智能体/工具审计/附件）；密钥 `modules/ai-secret-store.js`（safeStorage，无明文降级）；Provider `modules/ai-provider-client.js`（DeepSeek / 火山方舟 OpenAI 兼容、多接入点、流式空闲超时）；治理 `modules/ai-agent-catalog.js`、`modules/ai-skill-catalog.json`、`modules/ai-tool-registry.js`；IPC 注册集中在 `modules/ai-ipc.js`
- **IEP**：`iep/index.html`（Electron 壳）+ `iep/embedded-entry.html`（原业务页，webview 嵌入，需 `webviewTag: true`）
- **AI 心理测评**：`psy-login.html` / `psy-dashboard.html` 独立窗口 + `psyseen-login-state.js`（外部登录状态同步）
- **系统维护开关**：`advanced-settings.html` → `modules/ai-feature-flags-manager.js` → `ai-feature-flags.json`，控制智能体管理 / 知识技能 / 本月额度等面板可见性，AI 面板只读反映

## 开发注意事项

- ⚠️ **主进程模块改动需完全重启 app**：`main.js`、`modules/*.js`、`preload.js`、`ai-preload.js` 改动后 Ctrl+R 不生效（仅重载渲染层），曾导致「功能失效 / 接入点丢失」误报
- 打包收集规则在 `package.json` `build.files`（根目录 `*.html`/`*.js`/`*.json`、`images/**/*`、`fontawesome/**`、`modules/**`）；新增子目录代码须同步确认收集规则
- 修改激活逻辑后同步更新 `tools/` 下的生成工具；修改密钥策略后验证 `build/inject-keys.js`、`secret-manager.js`、`verify-keys.js`
- 改动页面入口后同步检查 `main.js`、`preload.js` 与对应 HTML 跳转关系

## 相关文档

- `readme.md` — 项目简介与入门
- `PROJECT_CONTEXT.md` — 开发交付日志（各 Phase 记录）
- `DEPLOYMENT_GUIDE.md` — 生产部署指南
- `USER_ACTIVATION_GUIDE.md` — 用户激活指南
- `tools/README.md`、`tools/QUICKSTART.md` — 激活码生成工具
- `系统参数技术文档.md`、`系统使用说明书.md` — 交付技术文档 / 使用说明书
