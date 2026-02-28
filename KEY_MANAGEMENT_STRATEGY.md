# 密钥管理策略说明

## 概述

本应用采用**分级密钥管理**策略，确保开发环境灵活性与生产环境安全性的平衡。

---

## 三个构建场景

### 1️⃣ **开发环境**（本地开发）

**密钥来源：** 系统环境变量 > .env 文件 > 内置默认值

```bash
# 方式A：设置系统环境变量（推荐）
set ACTIVATION_SECRET_KEY=你的密钥
npm start

# 方式B：使用.env文件
# 在项目根目录创建 .env 文件
# ACTIVATION_SECRET_KEY=你的密钥
npm start
```

**特点：**
- 开发者可以快速切换密钥进行测试
- 支持多种密钥配置方式
- 如果没有配置，使用内置默认值（便于快速测试）

---

### 2️⃣ **打包阶段**（生产构建）

**密钥来源：** 系统环境变量 → 注入到应用 → 生成 `embedded-secrets.js`

```bash
# 在打包前，确保系统中已设置密钥
set ACTIVATION_SECRET_KEY=生产环境密钥
set ACTIVATION_ENCRYPTION_KEY=加密密钥
set ACTIVATION_ENCRYPTION_IV=初始化向量

# 执行构建（会自动注入密钥）
npm run build
```

**流程：**
1. `npm run build` 执行时，先运行 `npm run prebuild`
2. `prebuild` 脚本（`build/inject-keys.js`）从系统环境变量读取密钥
3. 生成 `embedded-secrets.js` 文件（包含加密后的密钥）
4. `embedded-secrets.js` 被打包进应用
5. 用户安装应用后，密钥已自动包含

**特点：**
- 密钥在构建时注入，不依赖运行时环境变量
- 最终用户**无需配置任何环境变量**
- 密钥安全地嵌入在应用中

---

### 3️⃣ **最终用户运行**（已部署应用）

**密钥来源：** 内嵌的 `embedded-secrets.js`

```
用户安装应用 → 应用启动 → 自动加载内嵌密钥 → 激活系统工作
```

**特点：**
- 用户完全无感知，无需任何配置
- 应用可以正常验证激活码
- 所有密钥信息受保护

---

## 密钥文件说明

| 文件 | 用途 | 版本控制 | 位置 |
|-----|------|--------|------|
| `.env` | 开发环境配置 | ✅ 忽略 | 项目根目录 |
| `embedded-secrets.js` | 生产环境密钥 | ✅ 忽略 | 项目根目录 |
| `modules/secret-manager.js` | 开发环境密钥管理器 | ✅ 提交 | `modules/` |
| `modules/secret-manager-embedded.js` | 生产环境密钥管理器 | ✅ 提交 | `modules/` |
| `build/inject-keys.js` | 密钥注入脚本 | ✅ 提交 | `build/` |

---

## 构建流程图

```
开发环境                    打包阶段                      部署环境
   │                          │                             │
   ├─ .env 文件              ├─ npm run build             ├─ 应用安装
   ├─ 系统环境变量    ──→     ├─ prebuild 脚本    ───→    ├─ 内嵌密钥
   │  secret-manager.js       ├─ 密钥注入             │ embedded-secrets.js
   │                          ├─ 生成安装程序    ───→    │
   └─ npm start               │                         └─ 用户无需配置
                              └─ dist/*.exe
```

---

## 安全最佳实践

### ✅ 推荐做法

1. **开发时：** 在本地 `.env` 文件中配置密钥
   ```
   # .env
   ACTIVATION_SECRET_KEY=your-development-key-here
   ACTIVATION_ENCRYPTION_KEY=your-encryption-key
   ACTIVATION_ENCRYPTION_IV=your-iv
   ```

2. **打包前：** 设置生产密钥到系统环境变量
   ```bash
   # Windows
   set ACTIVATION_SECRET_KEY=production-secret-key
   set ACTIVATION_ENCRYPTION_KEY=production-encryption-key
   set ACTIVATION_ENCRYPTION_IV=production-iv
   ```

3. **构建应用：** 运行 npm run build
   ```bash
   npm run build
   ```

4. **分发：** 将生成的 `dist/*.exe` 分发给用户
   - 密钥已嵌入，用户无需额外配置

### ❌ 不要做的事

- ❌ 在代码中硬编码密钥
- ❌ 将密钥提交到 Git 仓库
- ❌ 在公共渠道分享密钥
- ❌ 在安装程序中添加环境变量设置提示（用户无需配置）
- ❌ 将 `.env` 文件包含在安装包中

---

## 激活码生成工具的密钥配置

激活码生成工具（`tools/activation-tool-cli.js`）也需要使用相同的密钥：

```bash
cd tools

# 方式1：使用系统环境变量（与应用保持一致）
set ACTIVATION_SECRET_KEY=你的生产环境密钥
node activation-tool-cli.js --interactive

# 方式2：使用.env文件（用于开发测试）
# 在 tools 目录下创建 .env 文件
# ACTIVATION_SECRET_KEY=你的密钥
node activation-tool-cli.js --interactive
```

**重要：** 生成激活码使用的密钥**必须与应用中嵌入的密钥完全相同**，否则会导致验证失败。

---

## 故障排查

### 问题：打包后用户无法激活

**原因：** 密钥不匹配

**解决方案：**
1. 检查 `embedded-secrets.js` 是否存在
2. 检查生成工具使用的密钥是否与应用中的相同
3. 确保打包时系统环境变量已正确设置

### 问题：激活码生成后无法验证

**原因：** 生成工具和应用使用了不同的密钥

**解决方案：**
1. 确保生成工具也使用同一个 `ACTIVATION_SECRET_KEY`
2. 重新生成密钥和应用

---

## 总结

| 阶段 | 配置方式 | 用户感知 |
|-----|---------|--------|
| 💻 开发 | 环境变量或 .env 文件 | 开发者设置 |
| 📦 打包 | 自动注入到应用 | 无感知 |
| 🚀 部署 | 内嵌在应用中 | **完全无感知** |

最终用户只需安装应用即可，无需任何密钥配置！
