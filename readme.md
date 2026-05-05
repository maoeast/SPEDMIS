# 特殊教育多模态干预系统（SPEDMIS）

## 项目简介

SPEDMIS 是一个基于 Electron 的桌面应用，用于集中展示、分类和启动特殊教育相关的多模态干预工具。应用包含激活校验、模块导航、使用统计、管理员配置、Logo 管理等能力，目标平台为 Windows 桌面环境。

## 当前能力

- 系统激活：基于机器码生成激活码，使用 HMAC-SHA256 校验，并以 AES-256-GCM 加密保存激活信息
- 模块导航：按领域和子功能展示应用列表，并支持启动外部应用
- 系统管理：提供用户中心、高级设置、Logo 配置、使用统计等页面
- 心理测验入口：支持独立的登录页和 Dashboard 页面
- 构建注入：打包前自动生成 `embedded-secrets.js`，将生产密钥嵌入安装包

## 技术栈

- Electron 23
- Node.js
- sql.js
- Jest
- Font Awesome

## 目录结构

```text
SPEDMIS/
├── activation.html               # 激活页面
├── advanced-settings.html        # 高级设置页面
├── apps.json                     # 应用元数据
├── build/
│   └── inject-keys.js            # 打包前密钥注入脚本
├── config.js                     # 统一配置
├── hardware.js                   # 硬件信息与机器码生成
├── images/                       # 图片资源
├── index.html                    # 主首页
├── logger.js                     # 日志模块
├── logo-settings.html            # Logo 管理页面
├── main.js                       # Electron 主进程
├── module.html                   # 模块列表页
├── modules/
│   ├── activation-crypto.js
│   ├── logo-handler.js
│   ├── machine-code-manager.js
│   ├── permission-manager.js
│   ├── product-name-manager.js
│   ├── secret-manager.js
│   ├── usage-stats.js
│   └── vm-detector.js
├── preload.js                    # 预加载脚本
├── psy-dashboard.html            # 心理测验 Dashboard
├── psy-login.html                # 心理测验登录页
├── statistics.html               # 使用统计页面
├── styles.css                    # 公共样式
├── test/                         # Jest 测试
├── tools/                        # 激活码生成工具
├── user-center.html              # 用户中心
├── verify-keys.js                # 密钥一致性检查脚本
└── readme.md
```

## 安装与运行

### 环境要求

- Node.js 16+
- npm 8+
- Windows 为主要运行目标；Linux / WSL 更适合开发和测试

### 本地启动

```bash
npm install
npm start
```

`npm start` 会以开发模式启动 Electron：

- `NODE_ENV=development`
- 未激活时加载 `activation.html`
- 已激活时加载 `index.html`

## 激活与密钥

### 开发环境

开发模式下，应用会按以下优先级加载密钥：

1. `embedded-secrets.js`
2. 系统环境变量
3. 项目根目录 `.env`
4. 开发默认值

相关变量：

- `ACTIVATION_SECRET_KEY`
- `ACTIVATION_ENCRYPTION_KEY`
- `ACTIVATION_ENCRYPTION_IV`

其中：

- `ACTIVATION_SECRET_KEY` 长度至少为 32 个字符
- `ACTIVATION_ENCRYPTION_KEY` 必须是 64 位十六进制字符串
- `ACTIVATION_ENCRYPTION_IV` 必须是 32 位十六进制字符串

### 生产构建

执行 `npm run build` 时，会先自动执行 `prebuild`，再进入 Electron Builder：

```bash
npm run build
```

其中 `prebuild` 会执行：

```bash
node build/inject-keys.js
```

该脚本会读取环境变量或 `.env`，生成未纳入版本控制的 `embedded-secrets.js`，供打包阶段使用。

### 激活码生成工具

仓库内置激活码工具，位于 `tools/` 目录。常用方式：

```bash
cd tools
node activation-tool-cli.js --interactive
```

相关文档：

- [tools/README.md](tools/README.md)
- [tools/QUICKSTART.md](tools/QUICKSTART.md)

## 测试

项目使用 Jest，测试文件位于 `test/` 目录。

常用命令：

```bash
npm test
npm run test:watch
npm run test:coverage
```

当前测试覆盖的主要模块包括：

- 激活加密
- 机器码管理
- 缓存
- 配置
- 日志
- 权限管理
- 产品名称管理
- 使用统计

## 打包说明

```bash
npm run build
```

打包配置位于 `package.json` 的 `build` 字段中，当前已明确将以下内容排除出安装包：

- `test/`
- `tools/`
- 构建辅助脚本
- 临时文档和归档文档

输出目录：

- `dist/`

## 相关文档

- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
- [USER_ACTIVATION_GUIDE.md](USER_ACTIVATION_GUIDE.md)
- [系统使用说明书.md](系统使用说明书.md)
- [系统参数技术文档.md](系统参数技术文档.md)

## 维护建议

- 修改激活逻辑后，优先同步更新 `tools/` 下的生成工具
- 修改密钥策略后，验证 `build/inject-keys.js`、`secret-manager.js` 和 `verify-keys.js`
- 修改页面入口后，同步检查 `main.js`、`preload.js` 和对应 HTML 跳转关系
- 提交前至少运行一次 `npm test`

## 许可证

MIT
