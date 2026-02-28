# Codebase Concerns

**Analysis Date:** 2026-02-28

## Security Considerations

### CRITICAL: Hardcoded Default Admin Password

**Issue:** The permission manager uses a weak, hardcoded default admin password.

**Files:** `modules/permission-manager.js:43`

```javascript
const DEFAULT_ADMIN_PASSWORD = '299451';
```

**Impact:** Any user with knowledge of the codebase can bypass admin authentication for Logo settings and product name modifications. This is a severe security vulnerability.

**Recommendations:**
1. Force password change on first use
2. Generate random default password during installation
3. Add password complexity requirements
4. Consider biometric or external authentication

### CRITICAL: Web Security Disabled in Electron

**Issue:** Web security is explicitly disabled in BrowserWindow configuration.

**Files:** `main.js:88`, `config.js:88-91`

```javascript
webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    enableRemoteModule: true,  // Deprecated and insecure
    preload: path.join(__dirname, 'preload.js'),
    webSecurity: false,  // SECURITY RISK
    devTools: true,
}
```

**Impact:** Disabling `webSecurity` allows CORS bypass and potentially malicious cross-origin requests. Combined with `enableRemoteModule: true` (deprecated since Electron 10), this creates significant attack surface.

**Recommendations:**
1. Set `webSecurity: true`
2. Remove `enableRemoteModule` (use IPC instead)
3. Implement strict CSP (Content Security Policy)

### HIGH: Development Keys in Example Files

**Issue:** `.env.example` contains actual key values that may be used in production if developers don't change them.

**Files:** `.env.example:3-13`

```
ACTIVATION_SECRET_KEY=SpecialEducationMultiModalInterventionSystem2023
ACTIVATION_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
ACTIVATION_ENCRYPTION_IV=0123456789abcdef
```

**Impact:** If `embedded-secrets.js` is missing, the app falls back to these weak defaults in development mode. An attacker could generate valid activation codes.

**Recommendations:**
1. Remove actual key values from `.env.example`
2. Use placeholders like `YOUR_SECRET_KEY_HERE`
3. Add validation to reject known weak keys

### HIGH: VM Detection Bypassed in Production

**Issue:** VM detection can be easily bypassed via environment variable.

**Files:** `main.js:238-248`

```javascript
if (vmResult.isVirtualMachine && process.env.ENABLE_VM_DETECTION !== 'false') {
    // Only logs warning, doesn't prevent execution
    // Production blocking code is commented out:
    // if (process.env.NODE_ENV === 'production') {
    //   app.quit();
    //   return;
    // }
}
```

**Impact:** Software piracy protection is ineffective. Users can run `ENABLE_VM_DETECTION=false` to bypass VM detection entirely.

**Recommendations:**
1. Remove environment variable bypass in production builds
2. Implement server-side license validation
3. Add additional anti-tampering measures

### MEDIUM: Permission Config Stored as Plaintext JSON

**Issue:** Admin password hash and session tokens stored in unencrypted JSON file.

**Files:** `modules/permission-manager.js:18-38`

**Impact:** While passwords are hashed, the config file can be manually edited to reset permissions or add session tokens.

**Recommendations:**
1. Encrypt the entire config file
2. Add integrity checking (HMAC)
3. Store sensitive data in system keychain

## Tech Debt

### HIGH: Duplicate Icon Mapping

**Issue:** App icon mapping is duplicated in two files with no single source of truth.

**Files:** `preload.js:7-118`, `config.js:287-402`

**Impact:** Maintaining two copies of 418 icon mappings is error-prone. Changes must be made in both places.

**Fix Approach:**
1. Move mapping to single location (`config.js`)
2. Import in `preload.js` or use IPC to fetch
3. Consider generating mapping from `apps.json`

### HIGH: Large Monolithic apps.json

**Issue:** `apps.json` contains 418 app entries (2927 lines, 93KB) loaded entirely into memory.

**Files:** `apps.json:1-2927`

**Impact:**
- Slow initial load
- High memory usage
- Difficult to maintain
- Risk of file corruption

**Fix Approach:**
1. Split into domain-based files (e.g., `apps-perception.json`, `apps-cognition.json`)
2. Implement lazy loading per category
3. Add schema validation

### MEDIUM: Mixed Callback and Promise Patterns

**Issue:** `hardware.js` uses callbacks wrapped in Promises, creating unnecessary complexity.

**Files:** `hardware.js:6-164`

```javascript
// Callback-based functions
function getHardDiskSerial(callback) { ... }

// Wrapped in Promises
function getHardDiskSerialAsync() {
    return new Promise((resolve, reject) => {
        getHardDiskSerial(result => resolve(result));
    });
}
```

**Fix Approach:**
1. Refactor to native async/await
2. Use `util.promisify` for child_process calls
3. Remove callback-based API

### MEDIUM: Console Logging in Production Code

**Issue:** `preload.js` uses `console.error` instead of proper logger for IPC errors.

**Files:** `preload.js:119-124`

```javascript
function handleIpcError(operationName, error, reject) {
    console.error(`[IPC Error] ${operationName}:`, error.message || error);
    // ...
}
```

**Impact:** Errors not captured in log files, making production debugging difficult.

**Fix Approach:**
1. Import and use logger module in preload
2. Route all errors through centralized logging
3. Add error tracking integration

## Performance Bottlenecks

### MEDIUM: Database Write on Every Operation

**Issue:** `usage-stats.js` writes SQLite database to disk after every insert/update.

**Files:** `modules/usage-stats.js:119-129`, `modules/usage-stats.js:164-166`

```javascript
function saveDatabase() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);  // Called after every operation
}
```

**Impact:** Frequent disk I/O degrades performance during heavy usage tracking.

**Fix Approach:**
1. Batch writes (e.g., every 10 operations or 30 seconds)
2. Use WAL (Write-Ahead Logging) mode
3. Defer writes to idle periods

### LOW: Inefficient Cache Stats Iteration

**Issue:** `cache.js` iterates entire cache for stats without optimization.

**Files:** `cache.js:131-147`

**Fix Approach:**
1. Maintain running stats counters
2. Sample instead of full iteration
3. Make stats retrieval async

## Fragile Areas

### HIGH: Single Point of Failure for Activation

**Issue:** Activation state stored in single JSON file. Corruption requires reactivation.

**Files:** `main.js:57-79`, `config.js:120-135`

```javascript
async function checkActivationStatus() {
    const activationDataString = await fs.promises.readFile(storagePath, 'utf8');
    const activationData = JSON.parse(activationDataString);
    // No backup, no recovery
}
```

**Impact:** File corruption (disk error, crash during write) locks user out permanently.

**Fix Approach:**
1. Create backup before writing
2. Implement atomic writes (write to temp, then rename)
3. Add recovery mechanism with support verification

### MEDIUM: Hardware Fingerprint Instability

**Issue:** Machine code generation depends on hardware that may change.

**Files:** `hardware.js:168-173`

```javascript
function generateMachineCode(hardwareInfo) {
    const rawCodeString = `${hardwareInfo.mac}-${hardwareInfo.cpu}-${hardwareInfo.hardDisk}-${hardwareInfo.motherboard}`;
    return crypto.createHash('sha256').update(rawCodeString).digest('hex');
}
```

**Impact:** Hardware changes (network card replacement, OS reinstall) invalidate activation.

**Fix Approach:**
1. Use more stable identifiers
2. Implement grace period for hardware changes
3. Allow limited reactivations

### MEDIUM: SQLite Database Corruption Risk

**Issue:** `sql.js` database has no WAL mode or corruption recovery.

**Files:** `modules/usage-stats.js:58-101`

**Fix Approach:**
1. Enable WAL mode for crash resistance
2. Add database integrity checks on load
3. Implement automatic backup/restore

## Test Coverage Gaps

### HIGH: Critical Security Modules Untested

**Issue:** Security-critical modules have no test coverage.

**Files Missing Tests:**
- `modules/secret-manager.js` - Key management
- `modules/activation-crypto.js` - Encryption/decryption
- `modules/vm-detector.js` - Anti-piracy
- `hardware.js` - Machine code generation

**Risk:** Security bugs in these modules go undetected.

**Priority:** High - Add unit tests immediately

### MEDIUM: IPC Handler Integration Tests Missing

**Issue:** No tests for IPC communication between main and renderer processes.

**Files:** `main.js:82-467`, `preload.js:131-312`

**Risk:** IPC vulnerabilities and race conditions undetected.

## Known Bugs

### MEDIUM: Race Condition in Activation Status Check

**Issue:** Activation check reads file before it may be fully written.

**Files:** `main.js:57-79`

**Trigger:** User activates while app is checking status.

**Symptoms:** Activation appears to fail, requires restart.

**Workaround:** Restart application after activation.

### LOW: Logger File Output Disabled by Default

**Issue:** File logging requires explicit enable, so production issues aren't captured.

**Files:** `logger.js:48`, `logger.js:130-144`

```javascript
this.enableFile = options.enableFile || false;  // Defaults to false
```

**Impact:** No persistent logs for troubleshooting production issues.

## Dependencies at Risk

### MEDIUM: Outdated Electron Version

**Issue:** Using Electron 23.x while current stable is 30+.

**Files:** `package.json:88`

```json
"electron": "^23.0.0"
```

**Risk:** Missing security patches and performance improvements.

**Migration Plan:**
1. Review Electron 23→30 breaking changes
2. Update deprecated APIs
3. Test thoroughly on all target platforms

### MEDIUM:(sql.js) Pure JS SQLite Limitations

**Issue:** `sql.js` is SQLite compiled to WASM/JS, not native bindings.

**Files:** `package.json:85`

**Limitations:**
- Slower than native SQLite
- No native optimizations
- Larger bundle size

**Alternative:** Consider `better-sqlite3` for production

## Missing Critical Features

### HIGH: No License Server Validation

**Issue:** Activation is entirely offline with no server validation.

**Impact:** Same activation code can be used on unlimited machines.

**Recommendation:** Implement optional online validation with offline fallback.

### MEDIUM: No Auto-Update Mechanism

**Issue:** Users must manually download and install updates.

**Impact:** Users remain on vulnerable old versions.

**Recommendation:** Implement `electron-updater` for automatic updates.

### MEDIUM: No Error Reporting

**Issue:** Errors logged locally but never reported to developers.

**Impact:** Unknown production issues, slow response to bugs.

**Recommendation:** Integrate error tracking (Sentry, etc.).

## Scaling Limits

### MEDIUM: Single Database File for Usage Stats

**Issue:** All usage data in one SQLite file.

**Current Capacity:** Works for individual users.

**Limit:** Will degrade with 10,000+ records.

**Scaling Path:**
1. Implement data archival
2. Split by date ranges
3. Add indexing on query columns

---

*Concerns audit: 2026-02-28*
