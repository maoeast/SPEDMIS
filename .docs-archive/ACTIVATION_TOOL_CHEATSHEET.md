# 激活码生成工具 - 快速参考卡

## 🚀 3 步快速开始

### 1️⃣ 配置密钥（仅一次）

```powershell
# Windows PowerShell
[Environment]::SetEnvironmentVariable("ACTIVATION_SECRET_KEY", "YourSecretKeyAtLeast32Chars", "Machine")
```

或创建 `.env` 文件：
```
ACTIVATION_SECRET_KEY=YourSecretKeyAtLeast32Chars
```

### 2️⃣ 选择使用方式

**方式 A: 交互模式（最简单）**
```bash
cd tools
node activation-tool-cli.js --interactive
```

**方式 B: Web 图形界面**
```bash
cd tools
npm install express multer
node activation-tool-server.js
# 打开 http://localhost:3000
```

**方式 C: 直接命令**
```bash
node activation-tool-cli.js --machine-code <64位十六进制码>
```

### 3️⃣ 发送激活码给用户

用户在应用中输入激活码，激活成功！

---

## 📋 常用命令速查表

### 命令行工具

```bash
# 交互模式（推荐）
node activation-tool-cli.js --interactive

# 生成单个激活码
node activation-tool-cli.js --machine-code abc123def456...

# 从 CSV 批量生成
node activation-tool-cli.js --csv input.csv --output output.csv

# 验证激活码
node activation-tool-cli.js --verify <激活码> --machine-code <机器码>

# 显示帮助
node activation-tool-cli.js --help

# 显示生成器状态
node activation-tool-cli.js --interactive  # 然后选择 "4"
```

### Web 服务器

```bash
# 启动服务器（默认端口 3000）
node activation-tool-server.js

# 使用自定义端口
node activation-tool-server.js --port 8080

# 在浏览器打开
http://localhost:3000
```

### 测试

```bash
# 运行所有测试（17 个）
node test-activation-generator.js

# 应该全部通过 ✓
```

---

## 💡 实际操作示例

### 为单个用户生成激活码

```bash
# 用户发送机器码：a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3

# 你运行：
node activation-tool-cli.js --machine-code a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3

# 输出：✓ 激活码生成成功！激活码：xyz789...

# 将 xyz789... 发送给用户
```

### 为 100 个用户批量生成

```bash
# 1. 准备 machines.csv（包含 100 个机器码）
# 2. 运行：
node activation-tool-cli.js --csv machines.csv --output codes.csv

# 3. codes.csv 现在包含所有激活码
# 4. 分别发送给对应用户
```

### 在 Web 界面批量处理

```bash
# 1. 启动服务器
node activation-tool-server.js

# 2. 在浏览器打开 http://localhost:3000

# 3. 选择"批量生成"选项卡

# 4. 上传 CSV 文件

# 5. 点击生成

# 6. 点击下载结果

# 完成！
```

---

## 🔐 密钥相关

### 密钥要求

- **长度**：至少 32 个字符
- **格式**：任意字符串（无特殊限制）
- **示例**：`SpecialEducationMultiModalInterventionSystem2023`

### 密钥配置优先级

1. **系统环境变量** `ACTIVATION_SECRET_KEY`（最优先）
2. **.env 文件** 中的 `ACTIVATION_SECRET_KEY`
3. **命令行参数** `--secret-key xxx`
4. **API 调用时传递**

### 验证密钥是否加载

```bash
# 运行交互模式
node activation-tool-cli.js --interactive

# 选择 "4. 查看生成器状态"

# 应显示：已加载密钥：是
```

---

## ❓ 常见问题快速答案

| 问题 | 答案 |
|------|------|
| **密钥未加载** | 设置环境变量或创建 .env，重启命令行 |
| **激活码验证失败** | 检查机器码和密钥是否正确，运行测试 |
| **Web 界面无法访问** | 确认服务器已启动，检查防火墙和端口 |
| **批量生成很慢** | 正常，1000 个通常需要 1-2 秒 |
| **能否修改密钥** | 可以，但会导致旧激活码失效 |

---

## 📄 文件说明

| 文件 | 用途 |
|------|------|
| **activation-code-generator.js** | 核心生成模块，可独立导入使用 |
| **activation-tool-cli.js** | 命令行工具，推荐日常使用 |
| **activation-tool-gui.html** | Web 界面，支持浏览器访问 |
| **activation-tool-server.js** | Express 服务器，支持 Web 和 API |
| **test-activation-generator.js** | 自动化测试，验证功能正确性 |
| **package.json** | NPM 依赖配置 |
| **README.md** | 完整文档 |
| **QUICKSTART.md** | 5 分钟快速开始 |

---

## 🎯 工作流程

### 标准激活流程

```
用户                          你                        应用
 │                            │                        │
 ├─→ 安装应用 ─────────────────────────────────────────>│
 │                            │                        │
 │                            │  ←─ 激活界面返回 ─────┤
 │                            │                        │
 │  ←─ 机器码 ─────────────────│                        │
 │   (发送邮件)               │                        │
 │                            │                        │
 │  获得机器码                │                        │
 │  运行工具生成激活码        │                        │
 │                            │                        │
 │  激活码发送给用户 ────────→│                        │
 │                            │  ─→ 输入激活码 ────→│
 │                            │                        │
 │                            │                        │
 │                            │  ←─ 激活成功消息 ─────┤
 │  ←─ 激活完成通知 ──────────│                        │
 │                            │  开始使用应用 ────→│
```

---

## 🔗 更多信息

- **完整文档**：`tools/README.md`
- **快速开始**：`tools/QUICKSTART.md` 或 `ACTIVATION_TOOL_CHEATSHEET.md`（本文件）
- **集成指南**：`ACTIVATION_TOOL_INTEGRATION.md`
- **完整总结**：`ACTIVATION_TOOL_SUMMARY.md`

---

## ✅ 检查清单

使用工具前：

- [ ] 已设置 `ACTIVATION_SECRET_KEY` 环境变量或 .env 文件
- [ ] 已运行 `node test-activation-generator.js` 验证功能
- [ ] 已选择使用方式（CLI/Web/API）
- [ ] 已准备好用户的机器码（64 位十六进制）

第一次使用后：

- [ ] 已成功生成激活码
- [ ] 已验证激活码有效性
- [ ] 已将激活码发送给用户
- [ ] 已确认用户激活成功

---

## 🚨 故障排查快速指南

```bash
# 问题 1: 密钥未加载
# 解决：设置环境变量
[Environment]::SetEnvironmentVariable("ACTIVATION_SECRET_KEY", "your-key", "Machine")
# 或创建 .env 文件

# 问题 2: 激活码验证失败
# 解决：运行测试确认工具正常
node test-activation-generator.js

# 问题 3: 生成器状态显示未初始化
# 解决：检查密钥是否正确加载
node activation-tool-cli.js --interactive
# 选择 "4" 查看状态

# 问题 4: Web 界面无法连接
# 解决：启动服务器并检查端口
node activation-tool-server.js --port 3000
# 检查防火墙是否阻止了端口
```

---

## 💬 推荐使用方式

| 场景 | 推荐方式 |
|------|---------|
| **日常单个激活** | 命令行 `--machine-code` |
| **首次使用** | 交互模式 `--interactive` |
| **批量处理 10+** | CSV 批量生成 `--csv` |
| **自己的应用中** | 导入 `activation-code-generator.js` |
| **不熟悉命令** | Web 图形界面 `activation-tool-server.js` |
| **验证功能** | 运行测试 `test-activation-generator.js` |

---

**版本：1.0.0 | 状态：✅ 完成 | 最后更新：2024 年**

**🎉 所有工具已准备好投入使用！**
