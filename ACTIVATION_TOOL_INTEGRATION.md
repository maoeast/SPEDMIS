# 激活码生成工具集成指南

本文档说明激活码生成工具与主应用如何协作，确保激活流程的完整性。

## 📊 系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│                      最终用户（用户电脑）                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  主应用 (特殊教育多模态干预系统)                        │    │
│  │  - 首次运行 → 生成机器码                                │    │
│  │  - 输入激活码 → 验证 → 激活成功                         │    │
│  │  - 使用 ACTIVATION_SECRET_KEY 验证激活码                │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                              ↕
                           邮件/通讯
                              ↕
┌──────────────────────────────────────────────────────────────────┐
│                   开发者（你的电脑或服务器）                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  激活码生成工具                                         │    │
│  │  - 接收用户的机器码                                     │    │
│  │  - 使用相同的 ACTIVATION_SECRET_KEY 生成激活码           │    │
│  │  - 返回激活码给用户                                     │    │
│  │  - 使用命令行 / Web GUI / API                           │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## 🔄 激活流程

### 步骤 1: 用户首次运行应用

```
用户电脑：
1. 安装应用
2. 首次运行 → 显示激活界面
3. 点击"获取机器码" → 应用生成机器码
4. 复制机器码发送给开发者
```

**代码位置 (main.js - 第 148-155 行)：**
```javascript
ipcMain.on(config.ipcChannels.getMachineCode, (event) => {
  logger.debug('Machine code request received');
  hardware.getHardwareInfo(hardwareInfo => {
    const machineCode = hardware.generateMachineCode(hardwareInfo);
    logger.debug('Machine code generated', { code: machineCode.substring(0, 8) + '...' });
    event.reply(config.ipcChannels.machineCodeResponse, machineCode);
  });
});
```

### 步骤 2: 开发者生成激活码

```
开发者电脑：
1. 接收用户的机器码
2. 运行生成工具
3. 输入用户的机器码
4. 获得激活码
5. 发送激活码给用户
```

**命令：**
```bash
cd tools
node activation-tool-cli.js --machine-code <user-machine-code>
```

**工作原理 (activation-code-generator.js - 第 84-110 行)：**
```javascript
generateActivationCode(machineCode) {
  // 使用 HMAC-SHA256 算法
  const hmac = crypto.createHmac('sha256', this.secretKey);
  hmac.update(machineCode);
  const activationCode = hmac.digest('hex');
  return { success: true, activationCode };
}
```

### 步骤 3: 用户输入激活码并激活

```
用户电脑：
1. 接收开发者的激活码
2. 在应用激活界面输入激活码
3. 点击"激活"按钮
4. 应用验证激活码
5. 激活成功 → 进入主界面
```

**代码位置 (main.js - 第 81-145 行)：**
```javascript
ipcMain.handle(config.ipcChannels.activate, async (event, arg) => {
  // 获取机器码
  const machineCode = hardware.generateMachineCode(hardwareInfo);
  
  // 验证激活码与机器码的匹配
  const secretKey = secretManager.getActivationSecretKey();
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(machineCode);
  const expectedActivationCode = hmac.digest('hex');
  
  // 验证用户输入的激活码是否匹配
  if (arg.activationCode !== expectedActivationCode) {
    reject(new Error('激活码无效'));
    return;
  }
  
  // 加密存储激活信息
  const encryptedData = activationCrypto.encryptActivationData(activationData);
  fs.promises.writeFile(storagePath, JSON.stringify({ encrypted: encryptedData }));
});
```

---

## 🔐 密钥同步

### 关键原则

激活码生成工具和主应用**必须使用相同的密钥**。

### 密钥流向

```
┌─────────────────────────────┐
│ ACTIVATION_SECRET_KEY 密钥  │
│ (开发者保管)                │
└──────────────┬──────────────┘
               │
        ┌──────┴──────┐
        ↓             ↓
   激活码生成工具   主应用
   (tools/)        (main.js)
        │             │
        ↓             ↓
   生成激活码    验证激活码
   (HMAC-SHA256) (HMAC-SHA256)
        │             │
        └──────┬──────┘
               ↓
          必须一致！
```

### 密钥配置检查清单

**在开发者机器上：**
- ✅ 设置环境变量 `ACTIVATION_SECRET_KEY`
- ✅ 或创建 `.env` 文件包含密钥
- ✅ 在构建时确保密钥被注入到应用中

**验证：**
```bash
# 检查工具能否正确加载密钥
cd tools
node activation-tool-cli.js --interactive
# 选择 "4. 查看生成器状态"
# 应显示：已加载密钥 = 是
```

---

## 📋 完整使用示例

### 示例 1：单个用户激活

**场景：** 一个用户需要激活应用

**用户端操作：**
```
1. 安装并运行应用
2. 看到激活界面
3. 点击"获取机器码"
4. 复制显示的机器码（64 位十六进制）
5. 通过邮件发送给开发者
```

**示例机器码：**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3
```

**开发者端操作：**
```bash
# 使用工具生成激活码
cd tools
node activation-tool-cli.js --machine-code a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3

# 输出：
# ✓ 激活码生成成功！
#   机器码:    a1b2c3d4e5f6...
#   激活码:    xyz789abc123...
```

**用户端完成激活：**
```
1. 在应用激活界面输入收到的激活码
2. 点击"激活"按钮
3. 看到"激活成功"提示
4. 应用自动加载主界面
```

### 示例 2：批量用户激活

**场景：** 多个用户需要激活应用

**收集阶段：**
```
从所有用户收集机器码到 machines.csv：

机器码
aaa...aaa
bbb...bbb
ccc...ccc
```

**生成阶段：**
```bash
cd tools
node activation-tool-cli.js --csv machines.csv --output codes.csv
```

**输出 codes.csv：**
```csv
序号,机器码,激活码,状态
1,"aaa...aaa","generated-code-1",success
2,"bbb...bbb","generated-code-2",success
3,"ccc...ccc","generated-code-3",success
```

**分发阶段：**
```
将每个用户的激活码通过邮件/消息发送给对应的用户
用户在自己电脑上的应用中输入激活码完成激活
```

---

## 🛠️ 算法一致性验证

### 算法对比

| 组件 | 算法 | 密钥 | 输入 | 输出 |
|------|------|------|------|------|
| **工具** | HMAC-SHA256 | ACTIVATION_SECRET_KEY | 机器码 | 激活码 |
| **主应用** | HMAC-SHA256 | ACTIVATION_SECRET_KEY | 机器码 | 激活码 |

### 代码对比

**工具的生成算法 (activation-code-generator.js)：**
```javascript
const hmac = crypto.createHmac('sha256', this.secretKey);
hmac.update(machineCode);
const activationCode = hmac.digest('hex');
```

**主应用的验证算法 (main.js)：**
```javascript
const hmac = crypto.createHmac('sha256', secretKey);
hmac.update(machineCode);
const expectedActivationCode = hmac.digest('hex');
```

**结论：** ✅ 两侧算法完全相同

### 测试验证

运行工具的内置测试确保一致性：

```bash
cd tools
node test-activation-generator.js

# 输出应该显示：
# 📋 测试 7: 与主应用算法的一致性
#   ✓ 应使用 HMAC-SHA256 算法
#   ✓ 生成的激活码应能被验证
#   ✓ 同一机器码应生成相同的激活码
#
# 🎉 所有测试通过！
```

---

## 🔍 故障排查

### 问题 1: 激活码在主应用中提示"无效"

**可能原因：**
1. 密钥不匹配（工具和应用使用了不同的密钥）
2. 机器码被修改或截断
3. 激活码被修改或截断

**诊断步骤：**
```bash
# 1. 验证工具能否验证自己生成的激活码
cd tools
node activation-tool-cli.js --machine-code <码> --verify <生成的激活码>
# 应显示：✓ 激活码有效！

# 2. 检查主应用中的密钥是否正确加载
# 查看应用日志（%APPDATA%\特殊教育多模态干预系统\logs\）
# 应包含："Activation secret key loaded"

# 3. 确认机器码完整性
# 长度应为 64 位十六进制字符
```

### 问题 2: 不同机器码生成相同的激活码

**这是 BUG！** 不应该发生

**原因可能：**
- 算法实现有误
- 密钥未正确加载
- HMAC 实现不正确

**解决：**
```bash
# 运行测试
cd tools
node test-activation-generator.js

# 如果失败，检查密钥配置
# 如果通过，说明工具没问题，问题在主应用端
```

### 问题 3: 生成的激活码无法被验证

**诊断：**
```bash
# 使用工具自身验证
cd tools

# 生成激活码
node activation-tool-cli.js --machine-code aaaa...aaaa
# 输出：激活码：xxxx...xxxx

# 立即验证
node activation-tool-cli.js --verify xxxx...xxxx --machine-code aaaa...aaaa
# 应输出：✓ 激活码有效！
```

**如果工具验证失败，说明生成过程有问题。**

---

## 🔐 安全建议

### 密钥安全

- ✅ 将密钥存储在安全的位置（环境变量或密钥管理系统）
- ✅ 定期轮换密钥
- ✅ 使用强密钥（至少 32 个字符）
- ❌ 不要在代码中硬编码密钥
- ❌ 不要通过不安全渠道传输密钥

### 激活码分发

- ✅ 通过安全渠道（邮件、内部系统）发送激活码
- ✅ 记录哪个用户收到了哪个激活码
- ✅ 定期审计激活码的使用情况
- ❌ 不要公开发布激活码
- ❌ 不要在日志中记录完整的激活码

---

## 📞 支持与联系

如遇到问题：

1. **查看日志：**
   - 主应用日志：`%APPDATA%\特殊教育多模态干预系统\logs\`
   - 工具日志：控制台输出

2. **运行测试：**
   ```bash
   node tools/test-activation-generator.js
   ```

3. **检查密钥配置：**
   ```bash
   node tools/activation-tool-cli.js --interactive
   # 选择 "4. 查看生成器状态"
   ```

---

**版本：** 1.0.0  
**最后更新：** 2024 年  
**状态：** ✅ 已完全集成并测试通过
