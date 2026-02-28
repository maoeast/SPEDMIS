# Electron 应用中的资源路径最佳实践

## 概述

在 Electron 应用中，特别是涉及打包部署时，资源文件的路径管理是一个常见的问题。本文档说明如何正确处理 Electron 应用中的各类资源路径。

## Electron 中的路径概念

### 1. 开发环境 vs 生产环境

| 环境 | 工作目录 | 资源加载方式 | 特点 |
|------|---------|-----------|------|
| **开发环境** | 项目根目录 | 直接文件访问 | 相对路径清晰 |
| **ASAR 打包** | 虚拟文件系统 | ASAR 内部路径 | 需要特殊处理 |
| **解包后** | 应用数据目录 | 文件系统路径 | 类似开发环境 |

### 2. 资源位置的三种情况

#### 情况 A：ASAR 内打包（不解包）
```
应用程序.exe
└── resources/
    └── app.asar （虚拟文件系统）
        ├── main.js
        ├── index.html
        ├── fonts/
        └── images/
```

**访问方式:**
```javascript
// Node.js 中
const path = require('path');
const fontsPath = path.join(__dirname, 'fonts');

// CSS 中（从 HTML 加载）
// 相对路径可能无法工作，因为路径在虚拟文件系统中
```

#### 情况 B：部分资源解包
```
应用程序.exe
└── resources/
    ├── app.asar （只包含代码）
    │   ├── main.js
    │   └── index.html
    └── app（解包的资源）
        ├── fonts/
        └── images/
```

**访问方式:**
```javascript
const path = require('path');
const fontsPath = path.join(app.getAppPath(), '..', 'fonts');
```

#### 情况 C：完全解包
```
应用程序.exe
└── resources/
    └── app/
        ├── main.js
        ├── index.html
        ├── fonts/
        └── images/
```

**访问方式:**
```javascript
const path = require('path');
const fontsPath = path.join(__dirname, 'fonts');
```

## 我们项目的配置

本项目采用了**情况 B** 的配置策略：

### package.json 中的配置

```json
{
  "build": {
    "asar": true,
    "asarUnpack": [
      "fonts/**/*",
      "node_modules/@fortawesome/fontawesome-free/**/*",
      "images/**/*",
      "fontawesome.css"
    ]
  }
}
```

**配置含义：**
- `"asar": true` - 将应用代码打包为 ASAR 格式
- `"asarUnpack"` - 指定哪些文件/目录不被打包进 ASAR，而是单独存放

**优势：**
1. ✅ 代码被保护在 ASAR 中，难以被逆向
2. ✅ 资源文件解包后，可以用相对路径访问
3. ✅ CSS 中的相对路径更可靠
4. ✅ 用户可以简单地替换资源文件（如 Logo）

## CSS 中的字体加载方式

### 三种方式的对比

| 方式 | 语法 | 开发 | ASAR 打包 | 解包 | 推荐指数 |
|------|------|------|----------|------|---------|
| **相对路径** | `url('./fonts/...')` | ✅ | ❌ | ✅ | ⭐⭐⭐⭐⭐ |
| **file:// 协议** | `url('file:///...')` | ⚠️ | ❌ | ⭐ | ⭐⭐ |
| **绝对路径** | `url('/fonts/...')` | ❌ | ❌ | ⚠️ | ⭐ |

### 推荐的做法

在 `fontawesome.css` 中使用**双备选方案**：

```css
@font-face {
  font-family: 'Font Awesome 6 Brands';
  src: 
    url('./fonts/fa-brands-400.woff2') format('woff2'),      /* 优先：相对路径 */
    url('file:///fonts/fa-brands-400.woff2') format('woff2'); /* 备选：file:// */
  font-weight: 400;
  font-style: normal;
  font-display: block;
}
```

**工作流程：**
1. 浏览器首先尝试 `./fonts/fa-brands-400.woff2`
2. 如果失败，尝试 `file:///fonts/fa-brands-400.woff2`
3. 任何一个成功都能加载字体

## 不同类型资源的路径指南

### 1. 图片资源（HTML/CSS 中）

```html
<!-- HTML 中 -->
<img src="images/logo.png" alt="Logo">
```

```css
/* CSS 中 */
background-image: url('images/background.png');
```

**原因:** HTML/CSS 中的相对路径相对于 HTML 文件位置

### 2. 字体资源（CSS 中）

```css
@font-face {
  src: url('./fonts/my-font.woff2') format('woff2');
}
```

**原因:** 同样相对于 HTML 文件位置

### 3. 数据文件（JavaScript 中）

```javascript
// 在主进程中
const path = require('path');
const appsJsonPath = path.join(app.getAppPath(), 'apps.json');

// 在渲染进程中（通过 IPC 获取）
// 不直接访问文件系统
```

### 4. 日志/配置文件（用户目录）

```javascript
const { app } = require('electron');
const path = require('path');

// 用户配置应该存储在用户目录，不是应用目录
const userDataPath = app.getPath('userData'); // 如: ~/AppData/Roaming/MyApp
const configPath = path.join(userDataPath, 'config.json');
```

## 常见问题排查

### 问题 1：CSS 中的字体无法加载

**症状:** 浏览器控制台显示 `Failed to load font from file:///fonts/...`

**原因:**
- 路径不正确（ASAR vs 解包）
- 文件未被正确打包
- 权限问题（file:// 协议限制）

**排查步骤:**
```javascript
// 在主进程的开发者工具中查看
const path = require('path');
const { app } = require('electron');
console.log('App path:', app.getAppPath());
console.log('Fonts path:', path.join(app.getAppPath(), 'fonts'));

// 检查文件是否存在
const fs = require('fs');
const fontsPath = path.join(app.getAppPath(), 'fonts');
console.log('Fonts directory exists:', fs.existsSync(fontsPath));
console.log('Files in fonts:', fs.readdirSync(fontsPath));
```

### 问题 2：打包后相对路径失效

**症状:** 开发环境正常，打包后字体无法加载

**原因:** ASAR 打包改变了文件结构

**解决方案:**
1. 确保字体文件在 `asarUnpack` 中
2. 使用双备选方案的 CSS 配置
3. 考虑在主进程中提供字体路径给渲染进程

### 问题 3：file:// 协议被阻止

**症状:** `Refused to load the font '...' because it violates the Content Security Policy directive`

**原因:** CSP 安全策略限制

**解决方案:**
```html
<!-- 在 HTML 中添加 CSP meta 标签 -->
<meta http-equiv="Content-Security-Policy" 
      content="font-src 'self' file: data:;">
```

## 主进程和渲染进程的资源访问

### 主进程（Node.js）

```javascript
// ✅ 可以直接访问文件系统
const path = require('path');
const fs = require('fs');

const filePath = path.join(app.getAppPath(), 'resources', 'data.json');
const data = fs.readFileSync(filePath, 'utf8');
```

### 渲染进程（浏览器）

```javascript
// ❌ 不能直接访问文件系统（安全限制）
// const fs = require('fs'); // 不可用

// ✅ 可以通过 IPC 与主进程通信
window.electronAPI.readFile('/path/to/file');

// ✅ 可以通过 URL 加载资源
fetch('images/data.json').then(r => r.json());
```

## 最佳实践总结

### ✅ DO（应该做）

1. **使用相对路径加载资源**
   ```css
   background-image: url('./images/bg.png');
   ```

2. **在 asarUnpack 中列出大型资源文件**
   ```json
   "asarUnpack": ["fonts/**/*", "images/**/*"]
   ```

3. **为资源提供备选方案**
   ```css
   src: url('./fonts/font.woff2'), url('file:///fonts/font.woff2');
   ```

4. **在主进程中使用 path.join() 构造路径**
   ```javascript
   const filePath = path.join(app.getAppPath(), 'data', 'file.json');
   ```

5. **将用户数据存储在 userData 目录**
   ```javascript
   const userPath = app.getPath('userData');
   ```

### ❌ DON'T（不应该做）

1. **不要假设工作目录是应用目录**
   ```javascript
   // ❌ 错误：打包后 __dirname 可能不是预期的位置
   const wrong = './fonts/font.woff2';
   ```

2. **不要在 CSS 中使用绝对路径**
   ```css
   /* ❌ 错误 */
   src: url('/fonts/font.woff2');
   ```

3. **不要在渲染进程中直接访问 node_modules**
   ```javascript
   // ❌ 错误
   const path = require('path'); // 不可用
   ```

4. **不要将用户配置存储在应用目录**
   ```javascript
   // ❌ 错误：用户可能没有写权限
   const configPath = path.join(__dirname, 'config.json');
   ```

## 参考资源

- [Electron 官方文档 - 打包应用](https://www.electronjs.org/docs/tutorial/application-distribution)
- [electron-builder 官方文档](https://www.electron.build/)
- [ASAR 格式说明](https://github.com/electron/asar)

---

**最后更新:** 2025-12-17  
**相关项目文件:** `fontawesome.css`, `package.json`
