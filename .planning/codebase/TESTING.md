# Testing Patterns

**Analysis Date:** 2026-02-28

## Test Framework

**Runner:**
- Jest 29.x
- Config: `jest.config.js` at project root

**Assertion Library:**
- Built-in Jest assertions (`expect`, `toBe`, `toEqual`, etc.)

**Run Commands:**
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode for development
npm run test:coverage # Run with coverage report
```

## Test File Organization

**Location:**
- Separate `test/` directory at project root
- Co-located naming: `cache.test.js` for `cache.js`

**Naming:**
- Pattern: `<module>.test.js`
- All lowercase with hyphens matching source

**Structure:**
```
project-root/
├── cache.js
├── config.js
├── logger.js
├── main.js
└── test/
    ├── cache.test.js
    ├── config.test.js
    ├── logger.test.js
    ├── permission-manager.test.js
    ├── product-name-manager.test.js
    └── usage-stats.test.js
```

## Test Structure

**Suite Organization:**
```javascript
/**
 * 缓存管理模块单元测试
 */

const { CacheManager, CacheEntry } = require('../cache');

describe('CacheEntry', () => {
    test('should create cache entry with correct properties', () => {
        const entry = new CacheEntry('key1', 'value1', 5000);

        expect(entry.key).toBe('key1');
        expect(entry.value).toBe('value1');
        expect(entry.ttl).toBe(5000);
    });
});

describe('CacheManager', () => {
    let cache;

    beforeEach(() => {
        cache = new CacheManager({ maxSize: 3 });
    });

    afterEach(() => {
        cache.destroy();
    });

    test('should set and get cache values', () => {
        cache.set('key1', 'value1');
        expect(cache.get('key1')).toBe('value1');
    });
});
```

**Patterns:**
- `describe()` for grouping related tests by class/module
- `test()` for individual test cases
- `beforeEach()` for test isolation setup
- `afterEach()` for cleanup (especially important for timers, DB connections)

**Naming Convention:**
- Descriptive test names: `should [action] [expected outcome]`
- Examples:
  - `should create cache entry with correct properties`
  - `should return undefined for missing keys`
  - `should handle TTL expiration`

## Mocking

**Framework:** Built-in Jest mocking

**Mocking Modules:**
```javascript
// Mock logger
jest.mock('../logger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    })
}));

// Mock electron app
jest.mock('electron', () => ({
    app: {
        getPath: (pathName) => {
            return 'C:\\Users\\Test\\AppData\\Roaming';
        }
    }
}));
```

**Console Mocking:**
```javascript
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

let capturedLogs = [];

function mockConsoleLog(...args) {
    capturedLogs.push({ level: 'log', args });
}

beforeAll(() => {
    console.log = mockConsoleLog;
    console.error = mockConsoleError;
    console.warn = mockConsoleWarn;
});

afterAll(() => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
});

beforeEach(() => {
    capturedLogs = [];
});
```

**What to Mock:**
- External dependencies (electron modules)
- File system operations in unit tests
- Logger output for verification
- Timers for async tests

**What NOT to Mock:**
- The module under test itself
- Pure utility functions being tested

## Fixtures and Factories

**Test Data:**
- Inline test data for simplicity
- No dedicated fixtures directory currently

**Example from `cache.test.js`:**
```javascript
test('should handle different data types', () => {
    const testCache = new CacheManager({ maxSize: 10 });

    testCache.set('string', 'value');
    testCache.set('number', 123);
    testCache.set('boolean', true);
    testCache.set('object', { a: 1, b: 2 });
    testCache.set('array', [1, 2, 3]);

    expect(testCache.get('string')).toBe('value');
    expect(testCache.get('number')).toBe(123);
    expect(testCache.get('boolean')).toBe(true);
    expect(testCache.get('object')).toEqual({ a: 1, b: 2 });
    expect(testCache.get('array')).toEqual([1, 2, 3]);

    testCache.destroy();
});
```

**Location:**
- Test data defined inline within test files
- No shared fixtures directory yet

## Coverage

**Requirements:** 70% threshold enforced
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

**Configured Files:**
```javascript
collectCoverageFrom: [
    'cache.js',
    'config.js',
    'logger.js',
    '!**/node_modules/**',
],
```

**View Coverage:**
```bash
npm run test:coverage
```

**Reporters:**
- `text` - Console output
- `lcov` - LCOV format for CI integration
- `json-summary` - JSON summary

## Test Types

**Unit Tests:**
- Test individual modules in isolation
- Mock external dependencies
- Focus on single responsibility

**Example from `logger.test.js`:**
```javascript
test('should log error messages when level allows', () => {
    const logger = new Logger({
        moduleName: 'TEST',
        level: LogLevel.ERROR,
        enableConsole: true,
        enableFile: false
    });

    logger.error('Test error message');

    expect(capturedLogs.length).toBeGreaterThan(0);
    const lastLog = capturedLogs[capturedLogs.length - 1];
    expect(lastLog.level).toBe('error');
    expect(lastLog.args[0]).toContain('ERROR');
});
```

**Integration Tests:**
- Limited integration testing currently
- Some tests verify module interaction (e.g., `permission-manager.test.js` checks `main.js` integration)

**E2E Tests:**
- Not currently implemented
- Manual testing via application

## Common Patterns

**Async Testing with Callbacks:**
```javascript
test('should check expiration correctly', (done) => {
    const entry = new CacheEntry('key1', 'value1', 100); // 100ms TTL

    expect(entry.isExpired()).toBe(false);

    setTimeout(() => {
        expect(entry.isExpired()).toBe(true);
        done();
    }, 150);
});
```

**Async Testing with Promises:**
```javascript
test('should return a valid path string', () => {
    try {
        const path = config.getActivationStoragePath();
        expect(typeof path).toBe('string');
    } catch (error) {
        expect(error).toBeDefined();
    }
});
```

**Error Testing:**
```javascript
test('should throw on invalid input', () => {
    expect(() => {
        someFunction(invalidInput);
    }).toThrow();
});
```

**Test Isolation:**
```javascript
describe('CacheManager', () => {
    let cache;

    beforeEach(() => {
        // Fresh instance for each test
        cache = new CacheManager({ maxSize: 3 });
    });

    afterEach(() => {
        // Cleanup resources (timers, connections)
        cache.destroy();
    });

    test('...', () => {
        // Test code
    });
});
```

**Jest Config (`jest.config.js`):**
```javascript
module.exports = {
    // 测试环境
    testEnvironment: 'node',

    // 测试匹配模式
    testMatch: ['**/test/**/*.test.js'],

    // 模块名称映射（如果需要）
    moduleNameMapper: {},

    // 覆盖率报告配置
    collectCoverageFrom: [
        'cache.js',
        'config.js',
        'logger.js',
        '!**/node_modules/**',
    ],

    // 覆盖率阈值
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70,
        },
    },

    // 测试超时时间（毫秒）
    testTimeout: 10000,

    // 覆盖率报告
    coverageReporters: ['text', 'lcov', 'json-summary'],

    // 详细输出
    verbose: true,
};
```

## Testing Best Practices Observed

1. **Test Isolation**: Each test gets fresh state via `beforeEach`
2. **Resource Cleanup**: `afterEach` cleans up timers, connections
3. **Descriptive Names**: Test names clearly state expected behavior
4. **Arrange-Act-Assert**: Clear structure in test bodies
5. **Edge Cases**: Tests cover null, undefined, empty cases
6. **Timeout Handling**: 10 second timeout for async operations

## Areas for Improvement

1. **Mock Consistency**: Some tests use `jest.mock()`, others don't
2. **Integration Coverage**: More integration tests needed for IPC flows
3. **E2E Testing**: Consider adding Playwright or similar for UI testing
4. **Test Fixtures**: Centralize common test data factories

---

*Testing analysis: 2026-02-28*
