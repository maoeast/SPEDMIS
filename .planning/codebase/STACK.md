# Technology Stack

**Analysis Date:** 2026-02-28

## Languages

**Primary:**
- JavaScript (ES2015+) - Main application code for Electron desktop app

**Secondary:**
- HTML5 - User interface markup
- CSS3 - Styling and layout
- JSON - Configuration and data storage

## Runtime

**Environment:**
- Node.js (version compatible with Electron 23)
- Electron 23.0.0 - Desktop application framework

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Electron 23.0.0 - Desktop application framework (`package.json`)
  - Provides native desktop capabilities
  - IPC communication between main and renderer processes
  - File system access and native API integration

**Testing:**
- Jest 29.0.0 - JavaScript testing framework (`package.json`)
  - Unit tests for core modules
  - Configuration: `jest.config.js`

**Build/Dev:**
- electron-builder 26.0.12 - Application packaging and distribution (`package.json`)
  - NSIS installer generation for Windows
  - ASAR archive creation
- cross-env 7.0.3 - Cross-platform environment variables (`package.json`)
- electron-packager 14.0.0 - Legacy packaging tool (`package.json`)

## Key Dependencies

**Critical:**
- sql.js 1.8.0 - SQLite database implementation in pure JavaScript (`package.json`)
  - Used for local data persistence in `modules/usage-stats.js`
  - Enables usage statistics tracking without external database
- @fortawesome/fontawesome-free 7.1.0 - Icon library (`package.json`)
  - UI icons throughout the application
  - Located in `fontawesome/` directory
- chart.js 3.9.1 - Charting library (`package.json`)
  - Data visualization for usage statistics

**Infrastructure:**
- crypto (Node.js built-in) - Cryptographic operations
  - AES-256-GCM encryption in `modules/activation-crypto.js`
  - HMAC-SHA256 for activation code generation in `main.js`
- fs (Node.js built-in) - File system operations
- path (Node.js built-in) - Path manipulation
- os (Node.js built-in) - Operating system interfaces
- child_process (Node.js built-in) - Process execution

## Configuration

**Environment:**
- `.env.example` - Environment variable template
- `.env` - Local environment configuration (gitignored)
- `NODE_ENV` - Controls development/production mode
- Key configuration in `config.js` with 439 lines

**Build:**
- `package.json` - Build configuration with electron-builder settings
  - Windows NSIS installer
  - ASAR packaging with unpacked assets
  - Icon configuration for installer

## Platform Requirements

**Development:**
- Node.js 12+ (per `tools/package.json` engines)
- npm 6+ (per `tools/package.json` engines)
- Windows (primary target) or macOS (supported)

**Production:**
- Windows x64 (primary deployment target)
- NSIS installer package
- No external runtime dependencies required for end users

## Code Structure Overview

**Entry Points:**
- `main.js` (467 lines) - Electron main process entry point
- `preload.js` (312 lines) - Context bridge for renderer process
- `index.html` - Main application UI

**Core Modules** (`modules/`):
- `secret-manager.js` (306 lines) - Secure key management
- `activation-crypto.js` (166 lines) - AES encryption/decryption
- `usage-stats.js` (495 lines) - SQLite-based usage tracking
- `permission-manager.js` (417 lines) - Admin permission system
- `logo-handler.js` (349 lines) - Logo upload/management
- `product-name-manager.js` (285 lines) - Product branding
- `vm-detector.js` (270 lines) - Virtual machine detection

**Utilities:**
- `config.js` (438 lines) - Centralized configuration
- `cache.js` (247 lines) - LRU caching with TTL support
- `logger.js` (319 lines) - Structured logging system
- `hardware.js` (181 lines) - Hardware fingerprinting

**Tools** (`tools/`):
- Activation code generator with CLI and web UI
- Express.js-based server for activation tool

---

*Stack analysis: 2026-02-28*
