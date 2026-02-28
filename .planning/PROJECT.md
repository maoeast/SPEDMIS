# 特殊教育多模态干预系统 - AI 心理测验集成

## What This Is

特殊教育多模态干预系统是一款 Electron 桌面应用，为教育工作者提供多模态干预工具的管理和统计。现需集成 psyseen.com 的 AI 心理测验功能，替换原有的"系统数据管理"模块。

## Core Value

为用户提供统一的应用启动平台和使用统计分析，同时集成第三方 AI 心理测验服务。

## Requirements

### Validated

- ✓ 激活/授权系统 — existing
- ✓ 模块化管理（5 个主模块） — existing
- ✓ 使用统计分析 — existing
- ✓ 产品配置管理 — existing
- ✓ 权限管理 — existing
- ✓ 虚拟机检测 — existing

### Active

- [ ] 将"系统数据管理"模块重命名为"AI 心理测验"
- [ ] 创建仿照 psyseen.com 样式的登录弹窗
- [ ] 在应用内嵌 psyseen.com 网页（使用 BrowserView）
- [ ] 实现用户名密码登录功能
- [ ] 登录后重定向到 dashboard 页面

### Out of Scope

- 修改 psyseen.com 网站本身 — 仅集成，不修改
- 本地存储 psyseen.com 账号密码 — 安全考虑，不存储
- 保留"系统数据管理"功能 — 明确替换

## Context

- 技术栈：Electron 23 + Node.js + HTML/CSS/JS
- 已有代码库映射完成（.planning/codebase/）
- 激活系统已修复 Linux 兼容性问题
- psyseen.com 登录地址：https://org.psyseen.com/#/login?redirect=%2Fdashboard

## Constraints

- **安全**: 不在本地存储第三方账号密码
- **兼容性**: 保持 Windows 和 Linux 双平台支持
- **UI 一致性**: 登录弹窗样式需仿照 psyseen.com

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 使用 BrowserView 内嵌网页 | 用户体验一致，无需离开应用 | — Pending |
| 替换"系统数据管理" | 简化功能聚焦 | — Pending |
| 弹窗登录表单 | 仿照目标网站样式 | — Pending |

---
*Last updated: 2026-02-28 after GSD initialization*
