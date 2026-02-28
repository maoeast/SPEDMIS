# AI_HANDOFF.md - 项目交接文档

> **最后更新：** 2025-12-25
> **项目版本：** 1.1.0
> **项目名称：** 特殊教育多模态干预系统 (SPED_MIS)

此文件用于 AI 会话间交接，确保新会话能快速了解项目状态。

---

## 项目当前状态

### 今日完成 (2025-12-25)

1. **清理冗余字体配置**
   - 移除了 `package.json` 中多余的 `fonts/**/*` 引用
   - 项目已使用 `fontawesome/webfonts/` 作为唯一字体源
   - `fonts/` 文件夹已被手动删除

---

## 关键技术决策与约束

### Font Awesome 使用规范

| 配置项 | 状态 | 说明 |
|--------|------|------|
| CSS 引用 | `./fontawesome/css/all.min.css` | 所有 HTML 文件统一使用此路径 |
| 字体文件 | `fontawesome/webfonts/*.woff2` | CSS 自动引用此目录 |
| 打包配置 | `asarUnpack: ["fontawesome/webfonts/**/*"]` | 字体必须解包才能加载 |
| 禁用目录 | `fonts/` | 已废弃，不再使用 |

**重要：** Font Awesome 的 CSS 文件中使用相对路径 `../webfonts/`，因此必须保持 `fontawesome/css/` 和 `fontawesome/webfonts/` 的目录结构。

### 打包配置要点

```json
{
  "files": [
    "fontawesome/css/**",
    "fontawesome/webfonts/**",
    "*.html",
    "*.js",
    "images/**/*",
    "*.json"
  ],
  "asarUnpack": [
    "images/**/*",
    "fontawesome/webfonts/**/*"
  ]
}
```

---

## 已解决的顽疾

### 问题：打包后字体文件重复且混乱

**表现：**
- `app.asar.unpacked/fonts/` 包含 Font Awesome 字体文件（4个 .woff2）
- `app.asar.unpacked/fontawesome/webfonts/` 也包含相同文件
- `fonts/` 目录从未被实际引用，造成冗余

**原因：**
- 历史遗留配置，`files` 和 `asarUnpack` 中都包含了 `fonts/**/*`
- 实际只有 `fontawesome/webfonts/` 被使用

**解决方案：**
1. 从 `files` 数组中移除 `"fonts/**/*"`
2. 从 `asarUnpack` 数组中移除 `"fonts/**/*"`
3. 手动删除源码中的 `fonts/` 目录

**防止复发：**
- 新增字体资源时统一使用 `fontawesome/webfonts/` 目录
- 不要创建独立的 `fonts/` 目录

---

## 待办事项

### 高优先级

- [ ] 重新打包应用（用户需要先关闭正在运行的应用）
- [ ] 验证打包后字体图标正常显示

### 中优先级

- [ ] 清理项目根目录下过多的分析/报告类 Markdown 文档
- [ ] 考虑将文档整理到 `docs/` 目录

---

## 应用启动方式

### 开发环境

```bash
npm start
```

### 打包构建

```bash
npm run build
```

**前置要求：**
- 需要设置以下环境变量（用于密钥注入）：
  - `ACTIVATION_SECRET_KEY`
  - `ACTIVATION_ENCRYPTION_KEY`
  - `ACTIVATION_ENCRYPTION_IV`

**构建流程：**
1. `prebuild` 脚本执行 `build/inject-keys.js`
2. 生成 `embedded-secrets.js`（密钥嵌入）
3. electron-builder 打包

---

## 项目目录结构

```
SPEDMIS/
├── main.js                 # Electron 主进程入口
├── package.json            # 项目配置和依赖
├── build/
│   └── inject-keys.js      # 密钥注入脚本
├── modules/
│   ├── secret-manager.js   # 密钥管理器
│   └── secret-manager-embedded.js  # 生产环境版本（自动生成）
├── fontawesome/
│   ├── css/               # Font Awesome 样式文件
│   └── webfonts/          # Font Awesome 字体文件（.woff2）
├── images/                # 应用图标和图片
├── tools/                 # 激活码生成工具
├── *.html                 # 各功能页面
└── dist/                  # 打包输出目录
```

---

## 重要配置说明

### 环境变量

开发环境可在系统环境变量或 `.env` 文件中配置：

```bash
ACTIVATION_SECRET_KEY=your_secret_key_here
ACTIVATION_ENCRYPTION_KEY=your_encryption_key
ACTIVATION_ENCRYPTION_IV=your_iv
```

### 密钥加载优先级

1. **嵌入式密钥** (`embedded-secrets.js`) - 生产环境首选
2. 系统环境变量 - 开发环境可覆盖
3. `.env` 文件 - 仅开发环境
4. 内置默认值 - 仅开发环境

---

## 常见问题速查

| 问题 | 解决方案 |
|------|----------|
| 打包失败，提示文件被占用 | 关闭正在运行的应用后重试 |
| 打包后图标不显示 | 检查 `asarUnpack` 是否包含 `fontawesome/webfonts/**/*` |
| 激活码验证失败 | 确保打包和生成工具使用同一密钥 |
| 无法加载密钥 | 检查环境变量是否正确设置 |

---

## Git 忽略规则

`.gitignore` 中包含：

```gitignore
# 敏感信息（密钥管理）
embedded-secrets.js
.env
```

**重要：** `embedded-secrets.js` 由构建脚本自动生成，切勿提交到版本控制。

---

## 相关文档

| 文档 | 用途 |
|------|------|
| `TODAY_WORK_SUMMARY.md` | 历史工作详细记录（2025-12-16） |
| `KEY_MANAGEMENT_STRATEGY.md` | 密钥管理策略说明 |
| `DEPLOYMENT_GUIDE.md` | 部署指南 |
| `DEVELOPER_BUILD_GUIDE.md` | 开发者构建指南 |

---

## 下次会话开始时建议

1. 首先阅读 `AI_HANDOFF.md` 了解项目状态
2. 检查 `package.json` 确认依赖和脚本配置
3. 如需打包，确认应用已关闭
4. 运行 `npm run build` 前检查环境变量是否已设置
