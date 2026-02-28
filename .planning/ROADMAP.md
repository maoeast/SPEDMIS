# Roadmap: SPEDMIS - AI 心理测验集成

**Created:** 2026-02-28
**Total Phases:** 1

## Phase Structure

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | AI 心理测验集成 | 完成"AI 心理测验"模块替换和登录功能 | UI-01~03, LOGIN-01~07, WEB-01~04, MOD-01~02 | 用户可登录 psyseen.com 并在应用内使用 |

## Phase Details

### Phase 1: AI 心理测验集成

**Goal:** 将"系统数据管理"模块替换为"AI 心理测验"，实现仿照 psyseen.com 样式的登录功能和网页内嵌

**Requirements:**
- UI-01: 模块标题改名
- UI-02: 图标更新
- UI-03: CSS 选择器更新
- LOGIN-01~07: 登录弹窗完整功能
- WEB-01~04: 网页内嵌功能
- MOD-01~02: 模块逻辑修改

**Success Criteria:**
1. 首页显示"AI 心理测验"模块（非"系统数据管理"）
2. 点击模块弹出登录对话框
3. 登录弹窗样式与 psyseen.com 一致
4. 输入正确账号密码后成功登录
5. 登录后在应用内显示 psyseen.com dashboard
6. 可返回主页

**Tasks:**
1. 修改 index.html 中模块定义
2. 修改 styles.css 中模块样式
3. 创建 login-dialog.html 和样式
4. 修改 module.html 处理逻辑
5. main.js 添加 BrowserView 支持
6. 测试登录和返回功能

---
*Last updated: 2026-02-28 after roadmap creation*
