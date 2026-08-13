# 激活码生成工具 - 快速开始

## 🎯 5 分钟快速上手

### 第一步：设置密钥（仅一次）

选择以下任一方式配置 `ACTIVATION_SECRET_KEY`：

#### 方式 A：环境变量（推荐）

```powershell
# Windows PowerShell
[Environment]::SetEnvironmentVariable("ACTIVATION_SECRET_KEY", "YourSecretKey123456789012345", "Machine")
```

#### 方式 B：.env 文件

在项目根目录创建 `.env` 文件：
```
ACTIVATION_SECRET_KEY=YourSecretKey123456789012345
```

### 第二步：选择使用方式

#### 方式 1️⃣：命令行交互模式（最简单）

```bash
cd tools
node activation-tool-cli.js --interactive
```

然后按菜单提示操作。

#### 方式 2️⃣：单文件 Web 界面（无需服务器，推荐）

直接双击打开 `activation-tool-gui.html`，浏览器即用：

- **单个生成** → 复制激活码 / 导出激活文件(.lis)
- **批量生成** → 下载结果 CSV / 📦 一键导出全部 .lis（ZIP 打包）
- **.lis 验证** → 拖入 .lis 文件，解析并校验激活码有效性
- **验证激活码** / **生成器状态**（密钥已内置，可修改）

#### 方式 3️⃣：命令行直接生成

```bash
# 生成单个激活码
node activation-tool-cli.js --machine-code abc123def456...

# 导出激活文件(.lis)（推荐：用户可在激活页面一键导入）
node activation-tool-cli.js --export-lis abc123def456...

# 批量生成（从 CSV）
node activation-tool-cli.js --csv input.csv --output output.csv

# 验证激活码
node activation-tool-cli.js --verify <激活码> --machine-code <机器码>
```

---

## 📋 实际应用场景

### 场景 1：用户首次激活

```
1. 用户运行应用 → 获取机器码 → 发送给你
2. 你运行工具 → 输入机器码 → 生成激活码
3. 你将激活码发送给用户
4. 用户输入激活码 → 应用激活成功
```

**操作步骤：**
```bash
node activation-tool-cli.js --interactive
# 选择选项 1，输入用户的机器码
# 记录生成的激活码，发送给用户
```

### 场景 2：批量激活多个用户

**1. 收集机器码到 `machines.csv`：**
```csv
机器码
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3
f6e5d4c3b2a1g0h9i8j7k6l5m4n3o2p1q0r9s8t7u6v5w4x3y2z1a0b9c8d7e6f5
```

**2. 批量生成：**
```bash
node activation-tool-cli.js --csv machines.csv --output codes.csv
```

**3. 查看 `codes.csv`，分发激活码给对应用户**

---

## 🔑 密钥说明

### 密钥的重要性

- 激活码是基于 **机器码 + 密钥** 通过 HMAC-SHA256 生成的
- **密钥决定了激活码**，改变密钥会导致所有激活码失效
- 密钥必须在 **工具和主应用中保持一致**

### 密钥长度要求

最少 32 个字符。示例：
```
SpecialEducationMultiModalInterventionSystem2023
MySecureKeyForActivationSystem123456789
```

### ⚠️ 重要安全提示

- ✅ 将 `.env` 添加到 `.gitignore`
- ✅ 使用强的随机密钥
- ❌ 不要在代码中硬编码密钥
- ❌ 不要通过不安全渠道传输密钥
- ❌ 不要告诉用户密钥是什么

---

## 🧪 测试工具

验证工具是否正常工作：

```bash
node test-activation-generator.js
```

应该看到所有 17 个测试都通过 ✓

---

## 💡 常见操作

### 生成单个激活码

```bash
node activation-tool-cli.js --machine-code a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3
```

输出：
```
✓ 激活码生成成功！

  机器码:    a1b2c3d4e5f6...
  激活码:    生成的激活码
```

### 验证激活码是否正确

```bash
node activation-tool-cli.js --verify <激活码> --machine-code <机器码>
```

输出应该是：
```
✓ 激活码有效！
```

### 从文件批量生成

**input.csv:**
```
机器码
aaa...
bbb...
ccc...
```

**运行：**
```bash
node activation-tool-cli.js --csv input.csv --output output.csv
```

**output.csv:**
```
序号,机器码,激活码,状态
1,"aaa...","生成的激活码",success
2,"bbb...","生成的激活码",success
3,"ccc...","生成的激活码",success
```

---

## 🚨 遇到问题？

### 问题 1：密钥未加载

**错误信息：** "未能加载密钥..."

**解决：**
1. 检查是否设置了环境变量或 `.env` 文件
2. 如果使用环境变量，重启命令行或 IDE
3. 尝试直接传递密钥：`node activation-tool-cli.js --secret-key "your-key" --machine-code ...`

### 问题 2：激活码验证失败

**错误信息：** "激活码无效！"

**检查：**
1. 机器码和激活码是否完整（未被截断）
2. 是否使用了相同的密钥生成和验证
3. 机器码格式是否正确（64 位十六进制）

### 问题 3：Web 界面无法打开

**错误：** 双击 `activation-tool-gui.html` 无反应或功能不可用

**解决：**
1. 使用较新的 Chrome / Edge 浏览器打开（需支持 Web Crypto `crypto.subtle`）
2. 若顶部徽章显示「密钥：未加载」，在「生成器状态」页输入密钥（≥32 字符）
3. 确认文件未被移动或改名（页面为自包含单文件，无外部依赖）

---

## 📚 更多信息

- 完整文档：见 `README.md`
- 测试脚本：`test-activation-generator.js`
- 核心模块：`activation-code-generator.js`

---

## 💬 推荐流程

1. **第一次使用：**
   ```bash
   # 设置密钥
   # 运行测试验证
   node test-activation-generator.js
   # 使用交互模式
   node activation-tool-cli.js --interactive
   ```

2. **日常使用：**
   ```bash
   # 快速生成
   node activation-tool-cli.js --machine-code ...
   
   # 或使用单文件 Web 界面
   双击 tools/activation-tool-gui.html
   ```

3. **批量处理：**
   ```bash
   # 从 CSV 批量生成
   node activation-tool-cli.js --csv input.csv --output output.csv
   ```

---

**准备好了吗？选择上面的任一方式开始吧！** 🚀
