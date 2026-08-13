# 激活码生成工具

完整的激活码生成解决方案，包括命令行工具、Web 图形界面和核心生成库。

## 📁 工具文件结构

```
tools/
├── activation-code-generator.js      # 核心生成模块（不依赖任何特定框架）
├── activation-tool-cli.js            # 命令行工具（node.js）
├── activation-tool-gui.html          # 单文件 Web 图形界面（纯 HTML5 + CSS3 + JS，双击即用）
├── test-activation-generator.js      # 工具自测脚本（17 项）
├── QUICKSTART.md                     # 快速上手
├── README.md                         # 本文件
└── 特殊教育多模态干预系统激活安全密钥.txt  # 密钥部署配置说明
```

## 🚀 快速开始

### 前置条件

- Node.js v12+
- npm 或 yarn

### 1. 命令行工具（推荐开发者使用）

#### 交互模式（最简单）

```bash
cd tools
node activation-tool-cli.js --interactive
```

界面菜单：
```
请选择操作:
  1. 生成单个激活码
  2. 从 CSV 文件批量生成
  3. 验证激活码
  4. 查看生成器状态
  5. 退出
```

#### 单个激活码

```bash
node activation-tool-cli.js --machine-code abc123def456...
```

#### 导出激活文件（.lis，推荐分发方式）

```bash
# 生成激活码并导出 .lis 激活文件（默认 ./SPEDMIS-<机器码前8位>.lis）
node activation-tool-cli.js --export-lis abc123def456...

# 指定输出路径
node activation-tool-cli.js --export-lis abc123def456... --lis-output ./out/abc.lis
```

交互模式中，生成单个激活码或批量生成后也会询问是否导出 .lis 文件。

#### 从 CSV 文件批量生成

创建 `machine_codes.csv`：
```
机器码
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3
f2e1d0c9b8a7g6h5i4j3k2l1m0n9o8p7q6r5s4t3u2v1w0x9y8z7a6b5c4d3e2f1g0
```

运行：
```bash
node activation-tool-cli.js --csv machine_codes.csv --output activation_codes.csv
```

#### 验证激活码

```bash
node activation-tool-cli.js --verify <激活码> --machine-code <机器码>
```

#### 显示帮助

```bash
node activation-tool-cli.js --help
```

---

### 2. Web 图形界面

#### 单文件模式（推荐，无需服务器）

直接双击打开 `activation-tool-gui.html`（或用浏览器打开该文件）即可使用全部功能：

- **单个生成**：输入机器码 → 生成激活码 → 复制 / 导出激活文件(.lis)
- **批量生成**：CSV 批量生成 → 下载结果 CSV → 📦 一键导出全部 .lis（ZIP 打包，浏览器内完成）
- **.lis 验证**：拖入 .lis 文件 → 解析内容（机器码/激活码/签发时间）→ 校验激活码有效性
- **验证激活码**：机器码 + 激活码匹配校验
- **生成器状态**：密钥管理（内置当前生产密钥，可修改并保存在本机浏览器 localStorage）与参数状态

> 全部计算（HMAC-SHA256、ZIP 打包）在本机浏览器完成，无任何网络请求。密钥默认内置，可在「生成器状态」页修改。

#### 功能

- **单个生成**：输入机器码，生成单个激活码，支持一键复制、导出激活文件(.lis)
- **批量生成**：上传 CSV 文件批量生成激活码，下载结果 CSV，一键导出全部 .lis（ZIP 打包），表格内每行可单独导出
- **.lis 验证**：拖入或选择 .lis 激活文件，解析内容（机器码/激活码/签发时间）并校验激活码有效性
- **验证激活码**：验证激活码是否与机器码匹配
- **生成器状态**：查看密钥加载情况、修改密钥（localStorage 持久化）与生成参数

---

### 3. 核心模块（程序员使用）

直接在你的 Node.js 代码中使用：

```javascript
const ActivationCodeGenerator = require('./activation-code-generator');

// 创建实例
const generator = new ActivationCodeGenerator();

// 初始化（会自动从环境变量或 .env 加载密钥）
if (!generator.initialize()) {
    console.error('初始化失败');
    process.exit(1);
}

// 生成单个激活码
const result = generator.generateActivationCode('a1b2c3d4e5...');
if (result.success) {
    console.log('激活码:', result.activationCode);
} else {
    console.error('错误:', result.error);
}

// 批量生成
const batchResult = generator.generateMultipleCodes([
    'a1b2c3d4e5...',
    'f6e5d4c3b2...'
]);

// 验证激活码
const isValid = generator.verifyActivationCode(machineCode, activationCode);

// 从 CSV 读取
const csvResult = generator.generateFromCSV('input.csv', { hasHeader: true });

// 保存到 CSV
generator.saveToCSV(csvResult.results, 'output.csv');

// 获取状态
const status = generator.getStatus();
```

---

## 📄 激活文件（.lis）

激活文件是激活码的分发载体，内容为 UTF-8 文本：

```
# SPEDMIS Activation File v1
machineCode=<64位十六进制机器码>
activationCode=<64位十六进制激活码>
issuedAt=<ISO 8601 签发时间>
```

**使用流程**：

1. 开发/客服人员使用工具导出 .lis 文件（CLI `--export-lis` 或 Web 界面「导出激活文件(.lis)」按钮）
2. 将 .lis 文件发送给用户
3. 用户在应用的激活页面点击「导入激活文件(.lis)」，选择该文件后自动完成激活

---

## 🔐 密钥配置

### 密钥加载优先级

工具按以下优先级加载密钥：

1. **系统环境变量** `ACTIVATION_SECRET_KEY`（最优先）
2. **项目根目录的 `.env` 文件**
3. **通过 API 或命令行参数手动提供**

### 配置方法

#### 方法 1：系统环境变量（推荐）

**Windows PowerShell:**
```powershell
[Environment]::SetEnvironmentVariable("ACTIVATION_SECRET_KEY", "your-secret-key-value", "Machine")
```

**Linux/macOS:**
```bash
export ACTIVATION_SECRET_KEY="your-secret-key-value"
```

#### 方法 2：.env 文件

在项目根目录创建 `.env` 文件：
```
ACTIVATION_SECRET_KEY=your-secret-key-value
```

**重要：将 `.env` 添加到 `.gitignore`**

#### 方法 3：命令行参数

```bash
node activation-tool-cli.js --secret-key "your-secret-key" --machine-code "..."
```

---

## 📋 CSV 文件格式

### 输入文件格式

**machine_codes.csv** (带表头)：
```csv
机器码
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3
f2e1d0c9b8a7g6h5i4j3k2l1m0n9o8p7q6r5s4t3u2v1w0x9y8z7a6b5c4d3e2f1g0
```

或 (无表头)：
```csv
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3
f2e1d0c9b8a7g6h5i4j3k2l1m0n9o8p7q6r5s4t3u2v1w0x9y8z7a6b5c4d3e2f1g0
```

支持 CSV（逗号分隔）和 TSV（制表符分隔）格式。

### 输出文件格式

**activation_codes.csv**：
```csv
序号,机器码,激活码,状态,错误信息
1,"a1b2c3d4e5f6...","生成的激活码",success,
2,"f6e5d4c3b2a1...","生成的激活码",success,
3,"无效的机器码","",failed,"机器码长度错误..."
```

---

## 🔑 密钥要求

### ACTIVATION_SECRET_KEY（激活系统密钥）

- **用途**：用于生成和验证激活码
- **长度**：至少 32 个字符
- **格式**：任意字符串
- **示例**：
  ```
  SpecialEducationMultiModalInterventionSystem2023
  MyCustomSecretKey123456789012345
  ```

### 获取与主应用一致的密钥

如果你已经在主应用中配置了 `ACTIVATION_SECRET_KEY`，工具会自动使用相同的密钥。

**验证密钥配置：**
```bash
node activation-tool-cli.js --interactive
# 选择 "4. 查看生成器状态" 以确认密钥已加载
```

---

## ✅ 激活码验证

### 生成与验证的一致性

激活码生成工具使用与主应用**完全相同的算法**：

```javascript
// 两边都使用 HMAC-SHA256
const hmac = crypto.createHmac('sha256', secretKey);
hmac.update(machineCode);
const activationCode = hmac.digest('hex');
```

这保证了工具生成的激活码能够被主应用正确验证。

### 测试验证

1. 使用工具生成激活码：
   ```bash
   node activation-tool-cli.js --machine-code abc123...
   ```

2. 验证生成的激活码：
   ```bash
   node activation-tool-cli.js --verify <激活码> --machine-code abc123...
   ```

3. 或在主应用的激活页面输入机器码和激活码，应该能正确激活。

---

## 🐛 常见问题

### Q: 密钥未加载？

**检查清单：**
1. 是否设置了 `ACTIVATION_SECRET_KEY` 环境变量？
2. 是否在项目根目录有 `.env` 文件包含 `ACTIVATION_SECRET_KEY`？
3. 查看生成器状态：`node activation-tool-cli.js --interactive` -> 选择 "4"

**解决方案：**
```bash
# 设置环境变量后，需要重启命令行或程序
[Environment]::SetEnvironmentVariable("ACTIVATION_SECRET_KEY", "your-key", "Machine")

# 验证是否生效
$env:ACTIVATION_SECRET_KEY
```

### Q: 激活码验证失败？

**常见原因：**
1. 使用了不同的密钥生成和验证
2. 机器码格式错误（应为 64 位十六进制）
3. 激活码被修改或截断

**检查步骤：**
```bash
# 1. 验证密钥是否正确加载
node activation-tool-cli.js --interactive  # 查看状态

# 2. 验证生成的激活码
node activation-tool-cli.js --verify <码> --machine-code <码>

# 3. 检查机器码格式
# 应为 64 个十六进制字符 (0-9, a-f)
```

### Q: Web 界面无法打开？

**检查步骤：**
1. 确认 `activation-tool-gui.html` 未被重命名或移动（其目录下所有功能均在本机浏览器完成）
2. 使用较新的浏览器（Chrome / Edge 等，需支持 Web Crypto `crypto.subtle`）
3. 顶部徽章显示「密钥：未加载」时，在「生成器状态」页配置密钥

### Q: 批量生成很慢？

- 这是正常的，取决于 CSV 文件大小
- 1000 个机器码通常需要 1-2 秒
- 如果需要处理大量数据，建议使用命令行工具

### Q: 如何保证密钥安全？

**安全建议：**
1. ✅ 将密钥存储在系统环境变量或 .env 文件中
2. ✅ 不要将密钥提交到版本控制系统
3. ✅ 添加 `.env` 和 `.env.*.local` 到 `.gitignore`
4. ✅ 使用强的随机密钥（至少 32 个字符）
5. ✅ 定期更新密钥
6. ❌ 不要在代码中硬编码密钥
7. ❌ 不要通过不安全的渠道传输密钥

---

## 📖 使用示例

### 示例 1：为新用户生成激活码

```bash
# 1. 用户运行主应用，获取机器码（例如：a1b2c3...）
# 2. 开发者使用工具生成激活码
node activation-tool-cli.js --machine-code a1b2c3d4e5f6...
# 输出: 激活码: abc123def456...
# 3. 将激活码返回给用户
# 4. 用户在主应用中输入激活码完成激活
```

### 示例 2：批量激活多个用户

```bash
# 1. 收集用户的机器码到 machines.csv:
# 机器码
# a1b2c3d4...
# f6e5d4c3...
# ...

# 2. 批量生成激活码
node activation-tool-cli.js --csv machines.csv --output codes.csv

# 3. 打开 codes.csv，查看结果
# 序号,机器码,激活码,状态
# 1,"a1b2c3d4...","生成的激活码",success
# 2,"f6e5d4c3...","生成的激活码",success

# 4. 将激活码分发给对应的用户
```

### 示例 3：使用 Web 界面

```text
# 1. 直接双击打开 activation-tool-gui.html（无需服务器）
# 2. 使用各种功能：
#    - 单个生成：复制粘贴机器码，点击生成，可导出 .lis 激活文件
#    - 批量生成：上传 CSV 文件，可一键导出全部 .lis（ZIP）
#    - .lis 验证：拖入 .lis 文件解析并校验激活码
#    - 验证激活码：验证生成的激活码
# 3. 下载结果 CSV / ZIP 文件
```

---

## 🔧 高级用法

### 自定义密钥配置

```javascript
const generator = new ActivationCodeGenerator();

// 使用自定义密钥初始化
const success = generator.initialize({
    secretKey: 'your-custom-secret-key'
});

if (success) {
    const result = generator.generateActivationCode('machine-code');
}
```

### 集成到自己的应用中

```javascript
// 在你的 Node.js 应用中
const ActivationCodeGenerator = require('./tools/activation-code-generator');

const generator = new ActivationCodeGenerator();
generator.initialize();

// 在 API 端点中使用
app.post('/api/generate-activation', (req, res) => {
    const { machineCode } = req.body;
    const result = generator.generateActivationCode(machineCode);
    res.json(result);
});
```

---

## 📝 许可证

MIT

## 🤝 支持

如有问题，请检查：
1. 密钥是否正确配置
2. 机器码格式是否正确（64 位十六进制）
3. 生成器状态是否正确初始化
4. 查看详细错误信息

---

**版本：** 1.0.0  
**最后更新：** 2024 年
