# Requirements: SPEDMIS - AI 心理测验集成

**Defined:** 2026-02-28
**Core Value:** 为用户提供统一的应用启动平台和使用统计分析，同时集成第三方 AI 心理测验服务

## v1 Requirements

### UI 修改

- [ ] **UI-01**: 将首页"系统数据管理"模块卡片标题改为"AI 心理测验"
- [ ] **UI-02**: 模块卡片图标更新为心理测验相关图标
- [ ] **UI-03**: CSS 选择器从 `data-module="系统数据管理"` 改为 `data-module="AI 心理测验"`

### 登录弹窗

- [ ] **LOGIN-01**: 点击"AI 心理测验"后弹出登录对话框
- [ ] **LOGIN-02**: 登录弹窗仿照 psyseen.com 样式（蓝色渐变背景、输入框样式）
- [ ] **LOGIN-03**: 用户名输入框（支持邮箱/用户名）
- [ ] **LOGIN-04**: 密码输入框（隐藏显示）
- [ ] **LOGIN-05**: 登录按钮
- [ ] **LOGIN-06**: 取消/关闭按钮
- [ ] **LOGIN-07**: 登录错误提示（密码错误/网络错误）

### 网页嵌入

- [ ] **WEB-01**: 登录成功后在应用内打开 psyseen.com dashboard
- [ ] **WEB-02**: 使用 Electron BrowserView 内嵌网页
- [ ] **WEB-03**: 网页全屏显示在模块页面内
- [ ] **WEB-04**: 提供返回按钮返回主页

### 模块逻辑

- [ ] **MOD-01**: 移除原"系统数据管理"的外部浏览器跳转逻辑
- [ ] **MOD-02**: module.html 中"系统数据管理"case 改为 AI 心理测验处理逻辑

## v2 Requirements

### 用户中心

- **USER-01**: 在 user-center.html 中添加 psyseen 账号绑定管理
- **USER-02**: 记住登录状态（可选，需用户同意）

### 数据同步

- **SYNC-01**: 将本地使用统计与 psyseen.com 数据关联

## Out of Scope

| Feature | Reason |
|---------|--------|
| 修改 psyseen.com 网站 | 仅集成，无权修改第三方服务 |
| 本地存储账号密码 | 安全风险，不符合最佳实践 |
| 保留"系统数据管理" | 明确替换，避免功能冗余 |
| 离线使用心理测验 | 依赖第三方在线服务 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| UI-01 | Phase 1 | Complete |
| UI-02 | Phase 1 | Complete |
| UI-03 | Phase 1 | Complete |
| LOGIN-01 | Phase 1 | Complete |
| LOGIN-02 | Phase 1 | Complete |
| LOGIN-03 | Phase 1 | Complete |
| LOGIN-04 | Phase 1 | Complete |
| LOGIN-05 | Phase 1 | Complete |
| LOGIN-06 | Phase 1 | Complete |
| LOGIN-07 | Phase 1 | Complete |
| WEB-01 | Phase 1 | Complete |
| WEB-02 | Phase 1 | Complete |
| WEB-03 | Phase 1 | Complete |
| WEB-04 | Phase 1 | Complete |
| MOD-01 | Phase 1 | Complete |
| MOD-02 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Complete: 16 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 after initial definition*
