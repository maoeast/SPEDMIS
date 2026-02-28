# External Integrations

**Analysis Date:** 2026-02-28

## APIs & External Services

**None detected:**
- This is a fully offline desktop application
- No external API calls or cloud service integrations found
- All functionality runs locally on user's machine

## Data Storage

**Databases:**
- SQLite (via sql.js) - Pure JavaScript implementation
  - Location: User's AppData directory
  - Path (Windows): `%APPDATA%\特殊教育多模态干预系统\data\usage-stats.db`
  - Path (macOS): `~/Library/Application Support/特殊教育多模态干预系统/data/usage-stats.db`
  - Client: sql.js 1.8.0 (in-memory with file persistence)
  - Tables: `usage_records`, `daily_stats` (see `modules/usage-stats.js`)

**File Storage:**
- Local filesystem only
- Activation data: `%APPDATA%\特殊教育多模态干预系统\activation.json` (encrypted)
- Product branding: `%APPDATA%\特殊教育多模态干预系统\config\product-branding.json`
- Logo files: `%APPDATA%\特殊教育多模态干预系统\logos\`
- Log files: `%APPDATA%\特殊教育多模态干预系统\logs\` (if enabled)

**Caching:**
- In-memory cache via `cache.js` with LRU eviction
- TTL-based expiration support
- Global singleton accessed via `getGlobalCacheManager()`

## Authentication & Identity

**Auth Provider:**
- Custom offline activation system
- No external authentication provider
- Implementation: HMAC-SHA256 based activation codes in `main.js`

**Activation Flow:**
1. Application generates machine code from hardware fingerprint (MAC, CPU, HDD, motherboard serials)
2. User obtains activation code from administrator (generated via `tools/activation-code-generator.js`)
3. Activation code verified locally using HMAC-SHA256 with secret key
4. Encrypted activation data stored in `activation.json` using AES-256-GCM

**Secret Key Management:**
- Primary: `embedded-secrets.js` (gitignored, see `.gitignore`)
- Fallback: System environment variables
- Development: `.env` file
- Secret manager: `modules/secret-manager.js`

## Monitoring & Observability

**Error Tracking:**
- None - No external error tracking service
- Errors logged locally via `logger.js`

**Logs:**
- Framework: Custom logger in `logger.js` (319 lines)
- Levels: ERROR, WARN, INFO, DEBUG
- Storage: File-based (optional, disabled by default)
- Console output: Enabled by default
- Log rotation: 10MB max file size, 5 backup files

## CI/CD & Deployment

**Hosting:**
- Desktop application - no hosting required
- Distributed as Windows executable via NSIS installer

**Build Process:**
```bash
npm run build    # Creates Windows x64 installer in dist/
npm run deploy   # Runs tests then build
```

**CI Pipeline:**
- None detected - No CI configuration files found

## Environment Configuration

**Required env vars** (from `.env.example`):
- `ACTIVATION_SECRET_KEY` - HMAC secret for activation code generation (32+ chars)
- `ACTIVATION_ENCRYPTION_KEY` - AES-256 encryption key (32 bytes hex)
- `ACTIVATION_ENCRYPTION_IV` - AES initialization vector (16 bytes hex)
- `ENABLE_VM_DETECTION` - Virtual machine detection toggle (`true`/`false`)
- `NODE_ENV` - Environment mode (`production`/`development`)

**Secrets location:**
- Production: `embedded-secrets.js` (excluded from git via `.gitignore`)
- Development: `.env` file (excluded from git)
- System: Environment variables (not stored in project)

## Webhooks & Callbacks

**Incoming:**
- None - Application does not expose web endpoints

**Outgoing:**
- None - Application does not call external webhooks

## IPC Communication (Internal)

**Renderer ↔ Main Process Channels** (defined in `config.ipcChannels`):

**Activation:**
- `activate` - Submit activation code
- `get-machine-code` / `machine-code-response` - Retrieve hardware fingerprint

**Module Management:**
- `get-module-categories` / `module-categories-response` - Query app categories
- `launch-application` - Execute external application

**Product Branding:**
- `get-product-name` / `set-product-name` - Read/write product branding
- `get-product-config` - Get full product configuration

**Logo Management:**
- `upload-logo` / `get-logos-list` / `delete-logo` - Logo CRUD operations

**Usage Statistics:**
- `record-usage-start` / `record-usage-end` - Track session timing
- `get-usage-stats` / `clear-usage-stats` - Query and manage statistics

**Permissions:**
- `verify-admin-password` / `update-admin-password` - Admin authentication
- `check-permission` - Permission verification
- `revoke-session` - Session invalidation

## Security Considerations

**Encryption:**
- AES-256-GCM for activation data (`modules/activation-crypto.js`)
- HMAC-SHA256 for activation code verification
- Keys managed by `modules/secret-manager.js`

**Hardware Fingerprinting:**
- MAC address, CPU ID, HDD serial, motherboard serial
- SHA-256 hash generates unique machine code
- Implementation: `hardware.js`

**VM Detection:**
- Virtual machine detection in `modules/vm-detector.js`
- Can block execution in VMs (configurable)

---

*Integration audit: 2026-02-28*
