# Coding Conventions

**Analysis Date:** 2026-02-28

## Naming Patterns

**Files:**
- Lowercase with hyphens: `product-name-manager.js`, `usage-stats.js`, `permission-manager.js`
- Test files mirror source: `cache.test.js` for `cache.js`
- Location: Root level for main modules, `modules/` for feature modules

**Functions:**
- camelCase: `getProductNameConfig()`, `verifyAdminPassword()`, `initializePermissions()`
- Descriptive verb prefixes: `get`, `set`, `verify`, `initialize`, `handle`

**Variables:**
- camelCase: `globalCacheManager`, `currentLevel`, `moduleName`
- Constants use camelCase for objects: `appConfig`, `windowConfig`, `loggingConfig`

**Classes:**
- PascalCase: `CacheManager`, `CacheEntry`, `Logger`
- Located at top of file before utility functions

**IPC Channels:**
- kebab-case: `'get-machine-code'`, `'launch-application'`, `'verify-admin-password'`
- Defined in `config.js` under `ipcChannels` object

## Code Style

**Formatting:**
- Indentation: 4 spaces (no tabs)
- Semicolons: Required at end of statements
- Line length: No strict enforcement observed
- Trailing commas: Used in multi-line objects

**Example from `cache.js`:**
```javascript
class CacheManager {
    constructor(options = {}) {
        this.maxSize = options.maxSize || 100;
        this.defaultTTL = options.defaultTTL || null;
        this.cache = new Map();
    }
}
```

**JSDoc Comments:**
- Required for all public functions and classes
- Format: `/** description */` above definition
- Parameters documented with `@param {Type} name - description`
- Return types documented with `@returns {Type}`

**Example from `cache.js`:**
```javascript
/**
 * 设置缓存值
 * @param {string} key - 缓存键
 * @param {*} value - 缓存值
 * @param {number} ttl - TTL（毫秒），null 表示永不过期
 */
set(key, value, ttl = this.defaultTTL) {
    // implementation
}
```

**Module-level Documentation:**
- Each file starts with header comment describing purpose
- Format: `/** Module description */` at line 1

**Example from `logger.js`:**
```javascript
/**
 * 日志系统模块
 * 统一的日志管理，支持多级别日志、结构化日志输出和日志分类
 */
```

## Import Organization

**Order:**
1. Node.js built-in modules (`fs`, `path`)
2. Electron modules (`app`, `BrowserWindow`, `ipcMain`)
3. Local modules (relative paths)

**Example from `main.js`:**
```javascript
const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const hardware = require('./hardware');
const config = require('./config');
const { getGlobalCacheManager } = require('./cache');
```

**Destructuring:**
- Used for named exports: `const { getLogger } = require('./logger')`
- Full module import for default-style: `const config = require('./config')`

## Error Handling

**Patterns:**
- Try-catch blocks for async operations
- Logger integration for all errors
- Consistent error object structure: `{ success: false, error: message }`

**Example from `main.js`:**
```javascript
ipcMain.handle(config.ipcChannels.activate, async (event, arg) => {
    logger.info('Activation request received');

    return new Promise((resolve, reject) => {
        // ... validation
        if (arg.activationCode.length !== config.activationConfig.activationCodeLength) {
            const error = config.logMessages.activation.codeFormatInvalid;
            logger.warn('Activation code format invalid', { receivedLength: arg.activationCode.length });
            reject(new Error(error));
            return;
        }
    });
});
```

**Logging Levels:**
- `logger.error()` - Exceptions, failures
- `logger.warn()` - Recoverable issues, validation failures
- `logger.info()` - Normal operations, state changes
- `logger.debug()` - Detailed diagnostic info

## Logging

**Framework:** Custom logger in `logger.js`

**Patterns:**
- Get logger instance: `const logger = getLogger('MODULE_NAME')`
- Include context in meta: `logger.info('message', { key: value })`
- Module name identifies source in logs

**Example from `main.js`:**
```javascript
const logger = getLogger('MAIN');

logger.debug('Machine code generated', { code: machineCode.substring(0, 8) + '...' });
logger.info('Application launched successfully', { path: appPath });
logger.error('Failed to save activation information', { error: err.message });
```

## Comments

**When to Comment:**
- File headers describing module purpose
- Complex algorithm explanations
- Important warnings or caveats
- Section dividers in large files

**JSDoc Usage:**
- All exported functions require JSDoc
- Include parameter types and descriptions
- Include return type

**Example from `config.js`:**
```javascript
/**
 * 获取当前环境
 * @returns {string} 环境标识 'production' 或 'development'
 */
function getEnvironment() {
    return process.env.NODE_ENV || 'development';
}
```

## Function Design

**Size:**
- Functions typically 20-50 lines
- Complex IPC handlers may reach 80 lines
- Break into helper functions when possible

**Parameters:**
- Use default parameters: `function foo(options = {})`
- Object parameters for 3+ arguments
- Destructure in signature when appropriate

**Return Values:**
- Consistent structure for IPC: `{ success: true, data: result }`
- Boolean for simple checks
- Undefined for void operations

## Module Design

**Exports:**
- CommonJS pattern: `module.exports = { ... }`
- Export all public functions and classes
- Group related exports together

**Example from `cache.js`:**
```javascript
module.exports = {
    CacheManager,
    CacheEntry,
    getGlobalCacheManager,
};
```

**Single Responsibility:**
- Each module handles one concern
- `cache.js` - caching only
- `logger.js` - logging only
- `config.js` - configuration constants only

**Dependencies:**
- Minimize circular dependencies
- `preload.js` avoids requiring `config.js` to prevent cycles
- Shared constants duplicated when necessary

## IPC Communication Patterns

**Main Process (`main.js`):**
- Use `ipcMain.handle()` for request-response
- Use `ipcMain.on()` + `event.reply()` for async operations

**Preload Script (`preload.js`):**
- Expose via `contextBridge.exposeInMainWorld()`
- Wrap in Promise with timeout handling
- Include error handling: `handleIpcError()`

**Example from `preload.js`:**
```javascript
getMachineCode: () => {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ipcRenderer.removeAllListeners('machine-code-response');
            handleIpcError('getMachineCode', new Error('Timeout'), reject);
        }, 5000);

        ipcRenderer.once('machine-code-response', (event, machineCode) => {
            clearTimeout(timeout);
            resolve(machineCode);
        });

        ipcRenderer.send('get-machine-code');
    });
}
```

---

*Convention analysis: 2026-02-28*
