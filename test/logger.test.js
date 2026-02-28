/**
 * 日志系统单元测试
 * 注意：某些测试需要 Electron app 模块，这里使用 mock
 */

const { Logger, LogLevel, LogLevelName, getLogger, createLogger } = require('../logger');

// Mock console methods to capture output
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

let capturedLogs = [];

function mockConsoleLog(...args) {
    capturedLogs.push({ level: 'log', args });
}

function mockConsoleError(...args) {
    capturedLogs.push({ level: 'error', args });
}

function mockConsoleWarn(...args) {
    capturedLogs.push({ level: 'warn', args });
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

describe('LogLevel', () => {
    test('should have correct level values', () => {
        expect(LogLevel.ERROR).toBe(0);
        expect(LogLevel.WARN).toBe(1);
        expect(LogLevel.INFO).toBe(2);
        expect(LogLevel.DEBUG).toBe(3);
    });
});

describe('LogLevelName', () => {
    test('should map level values to names', () => {
        expect(LogLevelName[0]).toBe('ERROR');
        expect(LogLevelName[1]).toBe('WARN');
        expect(LogLevelName[2]).toBe('INFO');
        expect(LogLevelName[3]).toBe('DEBUG');
    });
});

describe('Logger', () => {
    test('should create logger with default options', () => {
        const logger = new Logger({ moduleName: 'TEST' });

        expect(logger.moduleName).toBe('TEST');
        expect(logger.enableConsole).toBe(true);
        expect(logger.enableFile).toBe(false);
    });

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
        expect(lastLog.args[0]).toContain('Test error message');
    });

    test('should log warn messages when level allows', () => {
        const logger = new Logger({
            moduleName: 'TEST',
            level: LogLevel.WARN,
            enableConsole: true,
            enableFile: false
        });

        logger.warn('Test warning message');

        expect(capturedLogs.length).toBeGreaterThan(0);
        const lastLog = capturedLogs[capturedLogs.length - 1];
        expect(lastLog.level).toBe('warn');
        expect(lastLog.args[0]).toContain('WARN');
    });

    test('should log info messages when level allows', () => {
        const logger = new Logger({
            moduleName: 'TEST',
            level: LogLevel.INFO,
            enableConsole: true,
            enableFile: false
        });

        logger.info('Test info message');

        expect(capturedLogs.length).toBeGreaterThan(0);
        const lastLog = capturedLogs[capturedLogs.length - 1];
        expect(lastLog.level).toBe('log');
        expect(lastLog.args[0]).toContain('INFO');
    });

    test('should log debug messages when level allows', () => {
        const logger = new Logger({
            moduleName: 'TEST',
            level: LogLevel.DEBUG,
            enableConsole: true,
            enableFile: false
        });

        logger.debug('Test debug message');

        expect(capturedLogs.length).toBeGreaterThan(0);
        const lastLog = capturedLogs[capturedLogs.length - 1];
        expect(lastLog.level).toBe('log');
        expect(lastLog.args[0]).toContain('DEBUG');
    });

    test('should not log messages below current level', () => {
        const logger = new Logger({
            moduleName: 'TEST',
            level: LogLevel.WARN,
            enableConsole: true,
            enableFile: false
        });

        capturedLogs = [];
        logger.info('This should not be logged');
        logger.debug('This should not be logged either');

        // Should have no new logs
        expect(capturedLogs.length).toBe(0);
    });

    test('should include metadata in log output', () => {
        const logger = new Logger({
            moduleName: 'TEST',
            level: LogLevel.INFO,
            enableConsole: true,
            enableFile: false
        });

        capturedLogs = [];
        logger.info('Test message', { userId: 123, action: 'login' });

        const lastLog = capturedLogs[capturedLogs.length - 1];
        expect(lastLog.args[0]).toContain('userId');
        expect(lastLog.args[0]).toContain('action');
    });

    test('should set log level', () => {
        const logger = new Logger({
            moduleName: 'TEST',
            level: LogLevel.WARN,
            enableConsole: true,
            enableFile: false
        });

        capturedLogs = [];
        logger.info('Should not log');
        expect(capturedLogs.length).toBe(0);

        logger.setLevel(LogLevel.INFO);
        capturedLogs = [];
        logger.info('Should log now');
        expect(capturedLogs.length).toBeGreaterThan(0);
    });

    test('should format timestamp correctly', () => {
        const logger = new Logger({
            moduleName: 'TEST',
            level: LogLevel.INFO,
            enableConsole: true,
            enableFile: false
        });

        const timestamp = logger.formatTimestamp();

        // Check format: YYYY-MM-DD HH:MM:SS.MMM
        expect(timestamp).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/);
    });

    test('should include module name in formatted log', () => {
        const logger = new Logger({
            moduleName: 'CUSTOM_MODULE',
            level: LogLevel.INFO,
            enableConsole: true,
            enableFile: false
        });

        capturedLogs = [];
        logger.info('Test message');

        const lastLog = capturedLogs[capturedLogs.length - 1];
        expect(lastLog.args[0]).toContain('CUSTOM_MODULE');
    });
});

describe('Static methods', () => {
    test('should get level name from value', () => {
        expect(Logger.getLevelName(0)).toBe('ERROR');
        expect(Logger.getLevelName(1)).toBe('WARN');
        expect(Logger.getLevelName(2)).toBe('INFO');
        expect(Logger.getLevelName(3)).toBe('DEBUG');
    });

    test('should get level value from name', () => {
        expect(Logger.getLevel('ERROR')).toBe(0);
        expect(Logger.getLevel('WARN')).toBe(1);
        expect(Logger.getLevel('INFO')).toBe(2);
        expect(Logger.getLevel('DEBUG')).toBe(3);
    });
});

describe('getLogger', () => {
    test('should return same instance for same module name', () => {
        const logger1 = getLogger('MODULE1');
        const logger2 = getLogger('MODULE1');

        expect(logger1).toBe(logger2);
    });

    test('should return different instances for different module names', () => {
        const logger1 = getLogger('MODULE1');
        const logger2 = getLogger('MODULE2');

        expect(logger1).not.toBe(logger2);
    });

    test('should use custom options', () => {
        const logger = getLogger('CUSTOM', { level: LogLevel.DEBUG });

        expect(logger.currentLevel).toBe(LogLevel.DEBUG);
    });
});

describe('createLogger', () => {
    test('should create new instance each time', () => {
        const logger1 = createLogger('MODULE1');
        const logger2 = createLogger('MODULE1');

        expect(logger1).not.toBe(logger2);
    });

    test('should accept custom options', () => {
        const logger = createLogger('CUSTOM', { level: LogLevel.WARN });

        expect(logger.moduleName).toBe('CUSTOM');
        expect(logger.currentLevel).toBe(LogLevel.WARN);
    });
});
