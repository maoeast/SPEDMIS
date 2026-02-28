# 生产环境部署指南

## 部署前检查清单

### ✅ 代码质量验证
- [x] 单元测试通过率：99/99 (100%)
- [x] 所有模块编译通过
- [x] 代码安全审计完成

### ✅ 安全修复验证
- [x] 问题1：SECRET_KEY 硬编码 → 已修复（环境变量+密钥管理器）
- [x] 问题2：MD5 机器码算法 → 已修复（升级SHA-256+双验证）
- [x] 问题3：激活信息明文存储 → 已修复（AES-256-GCM加密）
- [x] 问题4：虚拟机防护不足 → 已修复（多层检测机制）

### ✅ 功能完整性验证
- [x] 产品信息个性化设置（含英文名称、版权信息）
- [x] 返回按钮样式统一优化
- [x] 模块二级页面设置按钮移除
- [x] 应用图标映射修复（418个应用）
- [x] IPC通信机制修复
- [x] 使用统计分析功能完整

---

## 部署步骤

### 第1步：准备部署环境

#### Windows Server / 用户电脑
```powershell
# 安装必要的环境
- Node.js v16+ (已安装)
- npm v8+ (已安装)
- electron v23.0.0 (在package.json中指定)

# 验证版本
node --version
npm --version
```

### 第2步：配置密钥（开发者操作，用户无需配置）

**密钥配置是开发者的责任，不是最终用户的操作。**

以下步骤在**你的开发电脑**或**部署服务器**上执行，用户安装的应用程序中**已经包含密钥**（通过环境变量或构建配置）。

#### 用户无需进行任何配置

最终用户的操作流程非常简单：
1. 下载并安装应用程序
2. 首次运行时，点击"获取机器码"按钮
3. 将机器码发送给开发者
4. 开发者使用激活码生成工具生成激活码
5. 用户在应用中输入开发者提供的激活码
6. 应用激活成功，可正常使用

**用户不需要、也不应该**接触任何环境变量、密钥文件或配置文件。

#### 开发者/部署管理员的配置

在**部署构建环境**中，配置密钥的方式如下：

**方案A：系统环境变量（推荐）**

```powershell
# 这些操作由开发者/部署人员在构建机器上执行
# 设置激活系统密钥（32字符以上）
[Environment]::SetEnvironmentVariable("ACTIVATION_SECRET_KEY", "你的实际密钥值", "Machine")

# 设置AES加密密钥（32字节十六进制，使用命令生成）
[Environment]::SetEnvironmentVariable("ACTIVATION_ENCRYPTION_KEY", "3c8d5f2e9a1b7c4f6e8d9a2b3c4f5e6a", "Machine")

# 设置AES初始化向量（16字节十六进制）
[Environment]::SetEnvironmentVariable("ACTIVATION_ENCRYPTION_IV", "2f4a6c8e1b3d5f7a", "Machine")

# 设置为生产环境
[Environment]::SetEnvironmentVariable("NODE_ENV", "production", "Machine")
```

**方案B：.env 文件（仅用于开发环境）**

```bash
# 仅在开发环境使用，不用于生产部署
cp .env.example .env

# 编辑 .env 文件（这个文件不会被打包到安装程序中）
ACTIVATION_SECRET_KEY=你的实际密钥值
ACTIVATION_ENCRYPTION_KEY=3c8d5f2e9a1b7c4f6e8d9a2b3c4f5e6a
ACTIVATION_ENCRYPTION_IV=2f4a6c8e1b3d5f7a
NODE_ENV=development

chmod 600 .env
```

**⚠️ 密钥安全提示：**
- ❌ 密钥仅在构建/部署时配置，不要提交到版本控制
- ❌ 不要将密钥文件分发给最终用户
- ✅ 最终用户的安装包中**已包含构建时配置的密钥**
- ✅ 最终用户**不需要手动配置密钥**
- ✅ 密钥应该由安全的密钥管理系统生成和保管


### 第3步：生成强密钥

**生成加密密钥（32字节，256位）：**

```powershell
# PowerShell (Windows)
$bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
$hex = $bytes | ForEach-Object { '{0:x2}' -f $_ } | Join-String
Write-Host "ACTIVATION_ENCRYPTION_KEY=$hex"

# 或使用Node.js
node -e "console.log('ACTIVATION_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"

# 或使用 OpenSSL
openssl rand -hex 32
```

**生成初始化向量（16字节，128位）：**

```powershell
# PowerShell (Windows)
$bytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(16)
$hex = $bytes | ForEach-Object { '{0:x2}' -f $_ } | Join-String
Write-Host "ACTIVATION_ENCRYPTION_IV=$hex"

# 或使用Node.js
node -e "console.log('ACTIVATION_ENCRYPTION_IV=' + require('crypto').randomBytes(16).toString('hex'))"

# 或使用 OpenSSL
openssl rand -hex 16
```

### 第4步：安装依赖和构建

```bash
# 安装生产依赖
npm install --production

# 运行测试确保一切正常
npm test

# 构建应用
npm run build

# 输出位置：./dist/特殊教育多模态干预系统*.exe
```

### 第5步：创建安装程序

```bash
# 构建会自动生成NSIS安装程序
npm run build

# 输出文件：
# - dist/特殊教育多模态干预系统 1.0.0.exe (NSIS 安装程序)
# - dist/builder-effective-config.yaml (构建配置)
```

### 第6步：测试安装程序

**在干净的测试环境中：**

1. **未激活状态测试**
   ```
   - 运行安装程序
   - 应显示激活页面
   - 无激活码无法进入主界面
   ```

2. **激活状态测试**
   ```
   - 输入有效激活码
   - 应成功激活并进入主界面
   - 激活信息应以加密形式存储
   ```

3. **功能完整性测试**
   ```
   - 产品信息显示：中文名+英文名+版权信息
   - 模块列表加载：应显示5个主模块
   - 应用图标显示：应正确显示418个应用的对应图标
   - 虚拟机检测：在虚拟机中运行应生成警告日志
   ```

4. **升级测试**
   ```
   - 从旧版本升级
   - 激活信息应自动迁移到新加密格式
   - 现有功能继续正常工作
   ```

---

## 生产环境配置文件

### 最小配置（production-min.env）

```bash
NODE_ENV=production
ACTIVATION_SECRET_KEY=your-secret-key-here-at-least-32-chars
ACTIVATION_ENCRYPTION_KEY=your-32-byte-hex-string-64-chars
ACTIVATION_ENCRYPTION_IV=your-16-byte-hex-string-32-chars
ENABLE_VM_DETECTION=true
```

### 完整配置（production-full.env）

```bash
# 环境标识
NODE_ENV=production

# 激活系统配置
ACTIVATION_SECRET_KEY=your-secret-key-here-at-least-32-chars
ACTIVATION_ENCRYPTION_KEY=your-32-byte-hex-string-64-chars
ACTIVATION_ENCRYPTION_IV=your-16-byte-hex-string-32-chars

# 虚拟机检测
ENABLE_VM_DETECTION=true

# 日志配置（可选）
LOG_LEVEL=warn

# 应用签名（可选，用于Windows更新）
WIN_CERTIFICATE_FILE=/path/to/certificate.pfx
WIN_CERTIFICATE_PASSWORD=certificate-password
```

---

## 部署后验证

### 应用启动检查

```powershell
# 查看应用日志（位置：%APPDATA%\特殊教育多模态干预系统\logs\）
Get-Content "$env:APPDATA\特殊教育多模态干预系统\logs\*.log" -Tail 50

# 验证密钥管理器初始化
# 日志应包含：
# - "Secret manager initialized"
# - "Activation secret key loaded from system environment"
# - "Encryption key loaded from system environment"
```

### 激活码验证检查

```bash
# 测试新激活
1. 获取机器码（点击获取机器码按钮）
2. 使用激活码生成工具生成新激活码
3. 输入激活码激活
4. 应激活成功

# 验证加密存储
file_path = "%APPDATA%\特殊教育多模态干预系统\data\activation.json"
# 应包含：{ "encrypted": "base64编码的加密数据" }
# 不应包含明文的 machineCode、activationCode 等
```

### 虚拟机检测验证

```bash
# 在虚拟机中运行应用
应用日志应包含：
- "Application is running in a virtual machine"
- "indicators: [...]"
- "confidence: XX%"
```

---

## 更新和回滚策略

### 更新现有用户

1. **数据迁移自动处理**
   ```
   - 旧激活信息（明文）→ 自动加密转换
   - 旧机器码（MD5）→ 继续兼容（使用双验证）
   - 用户感受：无感迁移
   ```

2. **发布说明**
   ```
   版本 1.1.0 更新内容：
   - 安全增强：激活信息加密存储
   - 机器码升级：MD5 → SHA-256
   - 虚拟机检测：添加反虚拟化防护
   - 功能改进：[列出所有功能更新]
   ```

### 遇到问题的回滚

```bash
# 如遇到严重问题，可快速回滚：
1. 停止提供新版本下载链接
2. 向已更新用户发送回滚指导
3. 从备份恢复旧版本安装程序
4. 用户卸载新版本，重新安装旧版本
   - 旧版本会自动识别并兼容新格式的加密激活信息
   - 无需重激活
```

---

## 监控和维护

### 关键监控指标

1. **激活相关**
   ```
   - 新激活失败率（应 < 1%）
   - 激活流程耗时（应 < 5秒）
   - 激活码验证错误率（应 < 0.1%）
   ```

2. **性能指标**
   ```
   - 应用启动时间（应 < 3秒）
   - 模块加载时间（应 < 2秒）
   - 应用图标加载失败率（应 0%）
   ```

3. **错误监控**
   ```
   - 密钥管理器初始化失败
   - 激活信息加解密失败
   - 虚拟机检测异常
   ```

### 日志位置和查看

```powershell
# 应用日志目录
$logDir = "$env:APPDATA\特殊教育多模态干预系统\logs\"

# 查看最新日志
Get-ChildItem $logDir | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content -Tail 100

# 查看特定错误
Select-String "ERROR" $logDir\*.log | Select-Object -First 20
```

---

## 生产环境故障排查

### 激活码无效错误

```
症状：激活码验证失败
原因：
  1. SECRET_KEY 不匹配
  2. 激活码算法不一致
  3. 机器码计算错误

排查步骤：
  1. 验证 ACTIVATION_SECRET_KEY 环境变量是否设置
  2. 确认激活码生成工具使用相同密钥
  3. 检查硬件信息采集是否正常（查看日志中的 machineCode）
  4. 确认激活码生成工具已更新为 SHA-256 算法
```

### 激活信息加解密失败

```
症状：应用启动时提示"激活信息已损坏"
原因：
  1. ACTIVATION_ENCRYPTION_KEY 改变
  2. 激活文件被修改
  3. 加密密钥与生成时使用的密钥不一致

排查步骤：
  1. 验证 ACTIVATION_ENCRYPTION_KEY 和 ACTIVATION_ENCRYPTION_IV 环境变量
  2. 检查文件权限，确保激活文件未被篡改
  3. 如无法恢复，用户需要重新激活
```

### 虚拟机检测误报

```
症状：在物理机上也提示"虚拟机"
原因：
  - 某些物理机的硬件配置触发了检测规则

解决方案：
  1. 设置 ENABLE_VM_DETECTION=false（仅用于内部测试）
  2. 在生产环境应设为 ENABLE_VM_DETECTION=true
  3. 如频繁误报，收集用户反馈，调整检测灵敏度
```

---

## 安全清单

部署前必须确认：

- [ ] ✅ SECRET_KEY 已配置在环境变量，未硬编码
- [ ] ✅ AES 加密密钥已设置，强度 ≥ 256位
- [ ] ✅ 初始化向量已设置且与加密密钥不同
- [ ] ✅ .env 文件已添加到 .gitignore
- [ ] ✅ 生产环境 NODE_ENV=production
- [ ] ✅ 虚拟机检测已启用（ENABLE_VM_DETECTION=true）
- [ ] ✅ 所有单元测试通过（99/99）
- [ ] ✅ 激活码生成工具已更新为 SHA-256
- [ ] ✅ 安装程序已在干净环境中测试
- [ ] ✅ 应用图标映射已验证（418个应用）
- [ ] ✅ IPC 通信已测试正常
- [ ] ✅ 日志系统已启用

---

## 联系方式和支持

遇到部署问题，请检查：

1. **日志文件** → %APPDATA%\特殊教育多模态干预系统\logs\
2. **应用配置** → %APPDATA%\特殊教育多模态干预系统\config.json
3. **激活信息** → %APPDATA%\特殊教育多模态干预系统\data\activation.json (加密)

---

## 版本信息

- 应用版本：1.0.0
- Electron：23.0.0
- Node.js：16.0.0+
- 发布日期：2024-12-16
- 安全修复：P0 x4, P1 x8
