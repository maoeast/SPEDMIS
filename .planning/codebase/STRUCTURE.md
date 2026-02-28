# Codebase Structure

**Analysis Date:** 2026-02-28

## Directory Layout

```
SPEDMIS/
├── main.js                  # Electron main process entry point (467 lines)
├── preload.js               # Preload script for IPC exposure (312 lines)
├── config.js                # Centralized configuration (438 lines)
├── cache.js                 # LRU cache with TTL (247 lines)
├── logger.js                # Logging system (319 lines)
├── hardware.js              # Hardware info & machine code generation (181 lines)
├── cozechat.js              # External chat integration
├── verify-keys.js           # Key verification utility (129 lines)
├── pre-deployment-checklist.js  # Pre-build validation (243 lines)
│
├── modules/                 # Feature modules
│   ├── secret-manager.js          # Encryption key management (306 lines)
│   ├── secret-manager-embedded.js # Embedded secrets (72 lines)
│   ├── activation-crypto.js       # AES-256-GCM encryption (166 lines)
│   ├── usage-stats.js             # SQLite usage tracking (495 lines)
│   ├── permission-manager.js      # Admin permissions (417 lines)
│   ├── product-name-manager.js    # Product branding (285 lines)
│   ├── logo-handler.js            # Logo upload/management (349 lines)
│   └── vm-detector.js             # VM environment detection (270 lines)
│
├── test/                    # Jest test files
│   ├── cache.test.js
│   ├── config.test.js
│   ├── logger.test.js
│   ├── permission-manager.test.js
│   ├── product-name-manager.test.js
│   └── usage-stats.test.js
│
├── tools/                   # Development & activation tools
│   ├── activation-code-generator.js
│   ├── activation-tool-cli.js
│   ├── activation-tool-server.js
│   ├── test-activation-generator.js
│   └── package.json
│
├── images/                  # Static image assets
│   ├── icon.ico, icon.png   # Application icons
│   ├── logo.png             # Default application logo
│   ├── *.png                # Module category icons (gjcj, sdzh, ysbd, etc.)
│   └── back.jpg, appback.png # Background images
│
├── fontawesome/             # Font Awesome icon library (v7.1.0)
│   ├── css/
│   ├── js/
│   ├── webfonts/
│   ├── scss/
│   ├── less/
│   └── svgs/
│
├── *.html                   # Renderer HTML pages
│   ├── index.html           # Main dashboard (270 lines)
│   ├── module.html          # Module listing (554 lines)
│   ├── activation.html      # Activation screen (324 lines)
│   ├── user-center.html     # User settings (197 lines)
│   ├── advanced-settings.html  # Admin panel (409 lines)
│   ├── logo-settings.html   # Logo management (283 lines)
│   └── statistics.html      # Usage dashboard (1004 lines)
│
├── styles.css               # Global styles (197 lines)
├── apps.json                # Application metadata database (320KB, 418 apps)
├── package.json             # npm configuration
├── jest.config.js           # Jest test configuration
├── .env.example             # Environment variable template
├── .gitignore               # Git ignore rules
│
├── .planning/               # AI planning documents
│   └── codebase/
│       ├── ARCHITECTURE.md
│       └── STRUCTURE.md
│
├── .claude/                 # Claude configuration
├── .git/                    # Git repository
├── node_modules/            # npm dependencies
└── dist/                    # Build output (created by electron-builder)
```

## Directory Purposes

**Root Directory:**
- Purpose: Main application code and configuration
- Contains: Entry points (`main.js`, `preload.js`), core utilities (`config.js`, `cache.js`, `logger.js`, `hardware.js`)
- Key files: `main.js` (Electron entry), `preload.js` (IPC bridge), `config.js` (configuration)

**`modules/`:**
- Purpose: Encapsulated feature implementations
- Contains: Business logic modules for activation, permissions, usage tracking, branding
- Key files: `secret-manager.js`, `activation-crypto.js`, `usage-stats.js`, `permission-manager.js`

**`test/`:**
- Purpose: Unit tests for core modules
- Contains: Jest test files matching source modules
- Key files: `cache.test.js`, `logger.test.js`, `permission-manager.test.js`

**`tools/`:**
- Purpose: Development utilities and activation code generation
- Contains: Standalone scripts for generating activation codes, testing
- Key files: `activation-code-generator.js`, `activation-tool-cli.js`

**`images/`:**
- Purpose: Static image assets bundled with application
- Contains: Icons, logos, backgrounds
- Key files: `icon.ico`, `logo.png`, category icons (`gjcj.png`, `sdzh.png`, etc.)

**`fontawesome/`:**
- Purpose: Icon library (Font Awesome Free v7.1.0)
- Contains: CSS, JS, webfonts, SVGs
- Note: Only `css/` and `webfonts/` included in production build

**`node_modules/`:**
- Purpose: npm dependencies
- Contains: Electron, electron-builder, sql.js, chart.js, jest
- Key packages: `electron@^23.0.0`, `sql.js@^1.8.0`, `chart.js@^3.9.1`

## Key File Locations

**Entry Points:**
- `main.js`: Electron main process, window creation, IPC handlers
- `preload.js`: Context bridge exposing `window.electronAPI` to renderer
- `index.html`: Main dashboard entry point
- `activation.html`: First-run activation entry point

**Configuration:**
- `config.js`: Window config, IPC channels, activation settings, icon mappings
- `package.json`: npm scripts, electron-builder config, dependencies
- `jest.config.js`: Test configuration, coverage thresholds
- `.env.example`: Environment variable template for secrets

**Core Logic:**
- `modules/secret-manager.js`: Key loading from embedded/env files
- `modules/activation-crypto.js`: AES-256-GCM encryption/decryption
- `modules/usage-stats.js`: SQLite database operations for usage tracking
- `modules/permission-manager.js`: Admin password and session management
- `hardware.js`: MAC address, CPU, disk, motherboard serial collection

**Testing:**
- `test/`: All unit tests
- `tools/`: Activation tool tests and utilities

**Data Files:**
- `apps.json`: 418 application metadata entries with 领域 (domain), 子功能 (subcategory)
- `activation.json` (runtime): User activation data in AppData
- `usage-stats.db` (runtime): SQLite database in AppData
- `permissions.json` (runtime): Admin permissions in AppData
- `product-branding.json` (runtime): Custom product names in AppData

## Naming Conventions

**Files:**
- JavaScript modules: kebab-case or camelCase (`secret-manager.js`, `usageStats.js`)
- Test files: `*.test.js` matching source file name
- HTML pages: kebab-case (`index.html`, `advanced-settings.html`)
- Configuration: `*.json`, `*.config.js`

**Modules:**
- Export pattern: `module.exports = { functionName, ... }`
- Logger naming: `const logger = getLogger('MODULE_NAME')`
- Module initialization: `initialize()` or `initializeXxx()` function

**Functions:**
- camelCase for functions: `getHardwareInfo()`, `encryptActivationData()`
- PascalCase for classes: `CacheManager`, `CacheEntry`, `Logger`
- Private methods: No prefix convention observed

**Variables:**
- camelCase: `mainWindow`, `secretConfig`, `vmIndicators`
- Constants: UPPER_SNAKE_CASE in config objects
- IPC channels: camelCase strings: `'activate'`, `'get-machine-code'`

## Where to Add New Code

**New Feature Module:**
- Primary code: `modules/<feature-name>.js`
- Add IPC handlers in `main.js` (after line 456, following existing pattern)
- Add IPC channel constant in `config.js` `ipcChannels` object
- Add preload API in `preload.js` `window.electronAPI` object
- Tests: `test/<feature-name>.test.js`

**New HTML Page:**
- Implementation: `<page-name>.html` in root directory
- Add navigation in existing pages as needed
- Use `window.electronAPI` for IPC communication

**New Configuration Setting:**
- Add to `config.js` in appropriate config object
- Follow existing structure: defaults, getters, path functions

**New Image Asset:**
- Location: `images/` directory
- Naming: kebab-case or category abbreviations (like existing `gjcj.png`)

**Utilities/Helpers:**
- Shared helpers: Create new file in root (`utils.js`) or add to existing module
- Avoid adding too many utilities to root; prefer `modules/` for organization

**Database Schema Changes:**
- Location: `modules/usage-stats.js` `initializeDatabase()` function
- Add migration logic if modifying existing tables

## Special Directories

**`modules/`:**
- Purpose: Feature encapsulation
- Generated: No
- Committed: Yes
- Pattern: Each module exports functions, may have `initialize()` function

**`test/`:**
- Purpose: Unit testing
- Generated: No
- Committed: Yes
- Pattern: One test file per module, Jest framework

**`tools/`:**
- Purpose: Development utilities (not bundled in production)
- Generated: No
- Committed: Yes
- Note: Has separate `package.json`, not part of main app

**`fontawesome/`:**
- Purpose: Icon library
- Generated: No (third-party)
- Committed: Yes
- Build exclusion: `js/`, `scss/`, `svgs/`, `sprites/`, `metadata/` excluded from production

**`node_modules/`:**
- Purpose: Dependencies
- Generated: Yes (`npm install`)
- Committed: No (in `.gitignore`)

**`.planning/codebase/`:**
- Purpose: AI-generated architecture documentation
- Generated: Yes (by GSD mapping)
- Committed: Yes
- Contains: `ARCHITECTURE.md`, `STRUCTURE.md`, etc.

**Runtime Directories (Not in repo):**
- `%APPDATA%/特殊教育多模态干预系统/` (Windows)
  - `activation.json`: Encrypted activation data
  - `config/product-branding.json`: Custom product names
  - `config/permissions.json`: Admin permissions
  - `logos/custom/`: Uploaded logos
  - `data/usage-stats.db`: SQLite database
  - `logs/`: Application logs (if file logging enabled)

---

*Structure analysis: 2026-02-28*
