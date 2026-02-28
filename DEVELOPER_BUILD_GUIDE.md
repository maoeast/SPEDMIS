# 开发者构建与部署指南

本指南说明**开发者如何构建包含密钥的可发布应用**，使得最终用户无需任何配置。

## 关键原则

- ✅ **最终用户无需配置**：安装包已包含所有必要的密钥配置
- ✅ **密钥安全管理**：密钥由开发者安全保管，不暴露给用户
- ✅ **激活码验证**：应用通过激活码验证用户的有效性
- ❌ **不向用户暴露密钥**：用户永远看不到、也不需要知道密钥

---

## 构建流程

### 前置条件

1. Node.js v16+ 已安装
2. npm v8+ 已安装
3. 已生成强密钥（见下一节）

### 第1步：生成密钥

**仅需执行一次**。使用以下命令生成强密钥：

```powershell
# 生成激活系统密钥（ACTIVATION_SECRET_KEY）
# 方式1：自定义密钥（至少32字符）
$secretKey = "YourCustomSecretKeyHere_AtLeast32Chars"

# 方式2：生成随机密钥
$secretKey = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32) | 
  ForEach-Object { '{0:x2}' -f $_ } | Join-String

# 生成AES加密密钥（ACTIVATION_ENCRYPTION_KEY）
$encryptionKey = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32) | 
  ForEach-Object { '{0:x2}' -f $_ } | Join-String

# 生成初始化向量（ACTIVATION_ENCRYPTION_IV）
$iv = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(16) | 
  ForEach-Object { '{0:x2}' -f $_ } | Join-String

Write-Host "ACTIVATION_SECRET_KEY=$secretKey"
Write-Host "ACTIVATION_ENCRYPTION_KEY=$encryptionKey"
Write-Host "ACTIVATION_ENCRYPTION_IV=$iv"
```

**保存这些密钥到安全的地方**（例如密钥管理系统或密钥文件）。

### 第2步：配置构建环境变量

在构建机器上设置系统环境变量（**仅在构建时，不在用户机器上**）：

```powershell
# 设置系统环境变量（需要管理员权限）
[Environment]::SetEnvironmentVariable("ACTIVATION_SECRET_KEY", "your-secret-key-value", "Machine")
[Environment]::SetEnvironmentVariable("ACTIVATION_ENCRYPTION_KEY", "your-encryption-key-value", "Machine")
[Environment]::SetEnvironmentVariable("ACTIVATION_ENCRYPTION_IV", "your-iv-value", "Machine")
[Environment]::SetEnvironmentVariable("NODE_ENV", "production", "Machine")
```

**验证环境变量是否设置成功**：
```powershell
$env:ACTIVATION_SECRET_KEY
$env:ACTIVATION_ENCRYPTION_KEY
$env:ACTIVATION_ENCRYPTION_IV
$env:NODE_ENV
```

### 第3步：清理旧的 .env 文件

确保项目中没有 `.env` 文件（如果有，删除它）：

```powershell
Remove-Item -Path ".\.env" -Force -ErrorAction SilentlyContinue
```

### 第4步：安装依赖

```bash
npm install --production
```

### 第5步：运行测试

```bash
npm test
```

应该看到所有测试通过。

### 第6步：构建应用

```bash
npm run build
```

或使用自定义构建脚本：

```bash
cross-env NODE_ENV=production ACTIVATION_SECRET_KEY="your-key" ACTIVATION_ENCRYPTION_KEY="your-key" ACTIVATION_ENCRYPTION_IV="your-iv" electron-builder --win --x64
```

**输出文件**：
- `dist/特殊教育多模态干预系统 1.0.0.exe` - NSIS 安装程序

### 第7步：验证构建产物

```powershell
# 检查安装程序是否生成
ls dist\*.exe

# 检查应用启动日志（在测试环境安装后）
# 应该包含：
# - "Secret manager initialized successfully"
# - "Activation secret key loaded from system environment"
```

---

## 密钥注入机制

### 应用启动时的密钥加载顺序

应用启动时，`secret-manager.js` 会按以下优先级加载密钥：

```
优先级1：系统环境变量（最高）
   ↓ 如果存在 ACTIVATION_SECRET_KEY 等，使用它们
   ↓
优先级2：.env 文件（仅开发环境）
   ↓ 如果 NODE_ENV=development 且 .env 存在，使用它们
   ↓
优先级3：内置默认值（仅开发环境）
   ↓ 仅在 NODE_ENV=development 时使用默认值
   ↓
优先级4：生产环境强制验证
   ↓ 如果 NODE_ENV=production 但缺少密钥，应用启动失败
```

### 生产构建的关键点

当 `NODE_ENV=production` 时：
- ❌ 不会使用 .env 文件
- ❌ 不会使用内置默认值
- ✅ **必须从系统环境变量读取密钥**
- ✅ **如果缺少密钥，应用会抛出错误并拒绝启动**

这确保了：
1. 没有密钥会被硬编码在代码中
2. 没有密钥会被包含在安装程序中
3. 构建时配置的密钥会被应用使用
4. 最终用户无法看到或修改密钥

---

## 安装包内容

构建后的应用安装包（`.exe`）包含：

```
特殊教育多模态干预系统 1.0.0.exe
├── 应用程序文件（Electron 打包）
├── main.js（主进程代码）
├── modules/
│   ├── secret-manager.js（密钥管理 - 在构建时已获得密钥）
│   ├── activation-crypto.js（加密逻辑）
│   └── ...
├── activation.html（激活界面）
├── index.html（主界面）
└── ...其他资源文件

⚠️ 特别注意：
- ❌ 安装包中 NO 明文密钥
- ❌ 安装包中 NO .env 文件
- ✅ 应用代码中可以访问构建时配置的密钥（通过环境变量）
```

---

## 多版本部署场景

### 场景1：为不同用户构建不同版本

如果需要为不同用户/组织构建不同的应用版本（使用不同的密钥）：

```powershell
# 版本1：用户A
[Environment]::SetEnvironmentVariable("ACTIVATION_SECRET_KEY", "secret-key-for-user-a", "Machine")
npm run build  # 生成 User_A_Version.exe

# 版本2：用户B
[Environment]::SetEnvironmentVariable("ACTIVATION_SECRET_KEY", "secret-key-for-user-b", "Machine")
npm run build  # 生成 User_B_Version.exe
```

### 场景2：统一构建，不同的密钥库

如果所有用户使用同一个应用版本，但激活码由中央密钥库管理：

1. 构建应用时使用统一的密钥
2. 所有用户都可以使用同一个应用版本
3. 激活码生成工具通过中央密钥库验证

---

## 激活码生成工具

**激活码生成工具**是开发者本地运行的工具，生成激活码。

### 使用 ACTIVATION_SECRET_KEY

激活码生成基于以下公式：

```javascript
const crypto = require('crypto');
const secretKey = 'your-activation-secret-key';
const machineCode = 'user-machine-code';

const hmac = crypto.createHmac('sha256', secretKey);
hmac.update(machineCode);
const activationCode = hmac.digest('hex');

console.log(`对于机器码 ${machineCode}，激活码为 ${activationCode}`);
```

**重要**：
- 生成激活码时使用的 `secretKey` 必须与应用中配置的 `ACTIVATION_SECRET_KEY` **完全相同**
- 如果密钥不匹配，用户输入的激活码将被认为无效

---

## 常见问题

### Q: 为什么要在构建时配置密钥？

**A:** 这样做有以下好处：
1. **安全性**：密钥不会出现在源代码或版本控制中
2. **灵活性**：不同环境（开发、测试、生产）可以使用不同的密钥
3. **用户体验**：最终用户无需进行任何复杂的配置
4. **防伪造**：生成的应用中密钥是不可更改的

### Q: 如果我忘记了密钥怎么办？

**A:** 如果丢失了密钥：
1. **之前生成的激活码全部失效**
2. **所有已激活的用户无法重新激活**
3. 必须使用新密钥重新构建应用
4. 所有用户需要使用新版本的应用

**建议**：
- 将密钥备份在安全的地方（密钥管理系统）
- 保留每个版本的密钥记录
- 定期备份

### Q: 我可以在用户机器上更改密钥吗？

**A:** 不可以，也不应该这样做：
1. 应用在生产环境下需要密钥匹配
2. 用户无法自己配置密钥（无法访问环境变量）
3. 如果需要更改密钥，必须重新构建应用并发布新版本

### Q: 旧版本和新版本应用使用不同的密钥，会有问题吗？

**A:** 可能有问题：
1. 旧版本和新版本的激活码相互不兼容
2. 旧版本的用户升级到新版本后，旧激活码将失效
3. 需要为用户提供升级指南和重新激活流程

**建议**：
- 尽可能保持相同的密钥
- 如果必须更改，提供迁移工具或一段时间内同时支持旧密钥

---

## 总结

开发者构建流程：
1. 生成强密钥（一次性）
2. 设置构建机器的环境变量
3. 运行 `npm run build`
4. 获得包含密钥配置的安装程序
5. 分发给用户

最终用户的使用流程：
1. 安装应用（无需配置任何东西）
2. 获取机器码
3. 提供机器码给开发者
4. 获得激活码
5. 输入激活码，激活成功

**关键点**：密钥管理完全由开发者负责，用户端完全无感。
