# Architecture

**Analysis Date:** 2026-02-28

## Pattern Overview

**Overall:** Electron Main-Renderer Architecture with Module-Based Feature Organization

**Key Characteristics:**
- Single main window with frameless design (`frame: false`)
- IPC-based communication between main and renderer processes
- Context isolation enabled for security (`contextIsolation: true`)
- Module-based feature organization in `modules/` directory
- File-based SQLite database for persistent storage
- HMAC-SHA256 based activation system with AES-256-GCM encryption

## Layers

**Main Process Layer:**
- Purpose: Application lifecycle, window management, system-level operations
- Location: `main.js`, `preload.js`
- Contains: BrowserWindow creation, IPC handlers, hardware detection, activation verification
- Depends on: All modules in `modules/`
- Used by: Renderer processes via IPC

**Module Layer:**
- Purpose: Encapsulated business logic and feature implementations
- Location: `modules/`
- Contains: Activation crypto, secret management, usage statistics, permissions, logo handling, product naming, VM detection
- Depends on: `config.js`, `logger.js`, `cache.js`
- Used by: Main process IPC handlers

**Configuration Layer:**
- Purpose: Centralized configuration management
- Location: `config.js`
- Contains: Window config, activation config, IPC channel constants, app icon mappings
- Depends on: Electron `app` module
- Used by: All modules and main process

**Renderer Layer:**
- Purpose: User interface and user interactions
- Location: `index.html`, `module.html`, `activation.html`, `advanced-settings.html`, `logo-settings.html`, `statistics.html`, `user-center.html`
- Contains: HTML pages with embedded JavaScript, CSS styling
- Depends on: `preload.js` exposed APIs via `window.electronAPI`
- Used by: End users

**Data Layer:**
- Purpose: Persistent storage and caching
- Location: `cache.js`, `modules/usage-stats.js` (SQLite via sql.js)
- Contains: In-memory LRU cache with TTL, file-based SQLite database
- Depends on: File system, sql.js library
- Used by: Main process and modules

## Data Flow

**Application Startup Flow:**

1. `app.whenReady()` triggers initialization
2. `secretManager.initialize()` loads encryption keys
3. `vmDetector.detectVirtualMachine()` checks environment
4. `productNameManager.initialize()`, `logoHandler.initialize()` setup features
5. `usageStats.initialize()` opens SQLite database
6. `permissionManager.initializePermissions()` loads permission config
7. `createWindow()` creates BrowserWindow
8. `checkActivationStatus()` verifies activation
9. Load `activation.html` or `index.html` based on status

**Activation Flow:**

1. Renderer: User inputs activation code → `window.electronAPI.activate()`
2. Preload: IPC `activate` channel → Main process
3. Main: `hardware.getHardwareInfo()` → generates machine code
4. Main: `secretManager.getActivationSecretKey()` → creates HMAC-SHA256
5. Main: Compares input code with expected code
6. Main: `activationCrypto.encryptActivationData()` → AES-256-GCM encryption
7. Main: Saves encrypted activation to `activation.json` in AppData
8. Main: Resolves IPC, renderer navigates to `index.html`

**Application Launch Flow:**

1. Renderer: User clicks app card → `window.electronAPI.getModuleCategories(domain)`
2. Main: Reads `apps.json` (cached via `getGlobalCacheManager()`)
3. Main: Filters apps by domain, groups by sub-category
4. Main: Returns categories via IPC response
5. Renderer: Displays module page with app list
6. User clicks app → `window.electronAPI.launchApplication(appPath)`
7. Main: `child_process.execFile()` launches external executable
8. Main: `usageStats.recordUsageStart()` logs usage to SQLite

**State Management:**
- In-memory: `CacheManager` in `cache.js` (LRU with TTL, max 100 items)
- Persistent: SQLite database for usage stats (`usage-stats.db`)
- Persistent: JSON files for activation, permissions, product config
- Session: Permission tokens stored in `permissions.json` with 1-hour expiry

## Key Abstractions

**IPC Channels (`config.ipcChannels`):**
- Purpose: Named communication channels between main and renderer
- Examples: `activate`, `get-machine-code`, `launch-application`, `upload-logo`
- Pattern: String constants defined in `config.js`, used in `main.js` and `preload.js`

**Cache Entry (`cache.CacheEntry`):**
- Purpose: Cache metadata with TTL and access tracking
- Location: `cache.js`
- Pattern: Class with `key`, `value`, `ttl`, `createdAt`, `accessCount`, `lastAccessTime`

**Logger (`logger.Logger`):**
- Purpose: Structured logging with levels and file rotation
- Location: `logger.js`
- Pattern: Factory function `getLogger(moduleName)` returns singleton per module

**Permission Session (`modules/permission-manager.js`):**
- Purpose: Time-limited authorization tokens for admin actions
- Pattern: Token stored with `createdAt` and `expiresAt` timestamps

## Entry Points

**Main Entry Point:**
- Location: `main.js`
- Triggers: `electron .` or `npm start`
- Responsibilities: App lifecycle, IPC handling, module initialization

**Preload Script:**
- Location: `preload.js`
- Triggers: Loaded automatically by BrowserWindow with `webPreferences.preload`
- Responsibilities: Expose `window.electronAPI` and `window.appConfig` to renderer

**HTML Entry Points:**
- `activation.html`: Initial activation screen (324 lines)
- `index.html`: Main dashboard (270 lines)
- `module.html`: Module listing page (554 lines)
- `user-center.html`: User settings and statistics (197 lines)
- `advanced-settings.html`: Admin settings (409 lines)
- `logo-settings.html`: Logo management (283 lines)
- `statistics.html`: Usage statistics dashboard (1004 lines)

## Error Handling

**Strategy:** Try-catch with structured error responses

**Patterns:**
- Main process: Wrap IPC handlers in try-catch, return `{success: false, error: message}`
- Modules: Throw errors with descriptive messages, catch at IPC boundary
- Renderer: `.catch()` on IPC promises, display toast/alert notifications
- Logging: All errors logged via `logger.error()` with context metadata

**Error Response Format:**
```javascript
// Success
{ success: true, data: {...} }

// Error
{ success: false, error: 'Error message' }
```

## Cross-Cutting Concerns

**Logging:** 
- Framework: Custom `Logger` class in `logger.js`
- Levels: ERROR, WARN, INFO, DEBUG
- Output: Console (always) + File (optional, in AppData/logs/)
- Rotation: 10MB max file size, 5 backups retained
- Usage: `const logger = getLogger('MODULE_NAME')`

**Validation:**
- File validation: `logoHandler.validateImageFile()` checks format, size
- Activation code: Length validation (64 chars), HMAC verification
- Permission: Session token validation with expiry check

**Authentication:**
- Activation: Machine code binding with HMAC-SHA256
- Admin actions: Password verification → session token generation
- Token storage: In `permissions.json` with 1-hour TTL

**Caching:**
- Tool: `CacheManager` class with LRU eviction
- TTL: Configurable per entry, auto-cleanup every 60 seconds
- Usage: `apps.json` cached for 1 hour to reduce file I/O

**Encryption:**
- Activation data: AES-256-GCM with random IV per encryption
- Secret keys: Loaded from `embedded-secrets.js` or environment variables
- Password storage: SHA-256 hash (not salted - security concern)

---

*Architecture analysis: 2026-02-28*
