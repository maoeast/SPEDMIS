/**
 * 日志系统模块
 * 统一的日志管理，支持多级别日志、结构化日志输出和日志分类
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const config = require('./config');

/**
 * 日志级别枚举
 */
const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
};

/**
 * 日志级别名称映射
 */
const LogLevelName = {
    0: 'ERROR',
    1: 'WARN',
    2: 'INFO',
    3: 'DEBUG',
};

/**
 * 日志记录器类
 */
class Logger {
    constructor(options = {}) {
        this.moduleName = options.moduleName || 'APP';
        this.currentLevel = options.level || LogLevel.INFO;
        this.enableConsole = options.enableConsole !== false;
        this.enableFile = options.enableFile || false;
        this.logDir = options.logDir || this.getDefaultLogDir();
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
        this.maxBackups = options.maxBackups || 5;

        // 确保日志目录存在
        if (this.enableFile) {
            this.ensureLogDirExists();
        }
    }

    /**
     * 获取默认日志目录
     * @private
     */
    getDefaultLogDir() {
        const appData = app ? app.getPath('userData') : './logs';
        return path.join(appData, 'logs');
    }

    /**
     * 确保日志目录存在
     * @private
     */
    ensureLogDirExists() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * 检查日志级别是否应该输出
     * @private
     */
    shouldLog(level) {
        return level <= this.currentLevel;
    }

    /**
     * 格式化日志时间戳
     * @private
     */
    formatTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
    }

    /**
     * 格式化日志输出
     * @private
     */
    formatLog(level, message, meta = {}) {
        const timestamp = this.formatTimestamp();
        const levelName = LogLevelName[level];
        const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';

        return {
            timestamp,
            level: levelName,
            module: this.moduleName,
            message,
            meta: metaStr,
            formatted: `[${timestamp}] [${levelName}] [${this.moduleName}] ${message}${metaStr ? ' ' + metaStr : ''}`,
        };
    }

    /**
     * 输出日志到控制台
     * @private
     */
    logToConsole(logEntry) {
        const { formatted, level } = logEntry;

        if (level === 'ERROR') {
            console.error(formatted);
        } else if (level === 'WARN') {
            console.warn(formatted);
        } else {
            console.log(formatted);
        }
    }

    /**
     * 输出日志到文件
     * @private
     */
    logToFile(logEntry) {
        try {
            const logFile = path.join(this.logDir, `${logEntry.level.toLowerCase()}.log`);
            const { formatted } = logEntry;

            // 检查文件大小，如果超过限制则轮转
            this.rotateLogFileIfNeeded(logFile);

            fs.appendFileSync(logFile, formatted + '\n', 'utf8');
        } catch (error) {
            console.error('Failed to write log to file:', error);
        }
    }

    /**
     * 检查并轮转日志文件
     * @private
     */
    rotateLogFileIfNeeded(logFile) {
        try {
            if (fs.existsSync(logFile)) {
                const stats = fs.statSync(logFile);
                if (stats.size > this.maxFileSize) {
                    const now = Date.now();
                    const backupFile = `${logFile}.${now}`;
                    fs.renameSync(logFile, backupFile);

                    // 删除过旧的备份文件
                    this.cleanupOldBackups(logFile);
                }
            }
        } catch (error) {
            console.error('Failed to rotate log file:', error);
        }
    }

    /**
     * 清理旧的日志备份文件
     * @private
     */
    cleanupOldBackups(logFile) {
        try {
            const dir = path.dirname(logFile);
            const basename = path.basename(logFile);
            const files = fs.readdirSync(dir);

            const backupFiles = files
                .filter(file => file.startsWith(basename + '.'))
                .sort()
                .reverse();

            // 保留指定数量的备份文件
            backupFiles.slice(this.maxBackups).forEach(file => {
                try {
                    fs.unlinkSync(path.join(dir, file));
                } catch (e) {
                    // 忽略删除失败的错误
                }
            });
        } catch (error) {
            console.error('Failed to cleanup old backups:', error);
        }
    }

    /**
     * 内部日志输出方法
     * @private
     */
    log(level, message, meta = {}) {
        if (!this.shouldLog(level)) {
            return;
        }

        const logEntry = this.formatLog(level, message, meta);

        if (this.enableConsole) {
            this.logToConsole(logEntry);
        }

        if (this.enableFile) {
            this.logToFile(logEntry);
        }
    }

    /**
     * 错误日志
     */
    error(message, meta = {}) {
        this.log(LogLevel.ERROR, message, meta);
    }

    /**
     * 警告日志
     */
    warn(message, meta = {}) {
        this.log(LogLevel.WARN, message, meta);
    }

    /**
     * 信息日志
     */
    info(message, meta = {}) {
        this.log(LogLevel.INFO, message, meta);
    }

    /**
     * 调试日志
     */
    debug(message, meta = {}) {
        this.log(LogLevel.DEBUG, message, meta);
    }

    /**
     * 设置日志级别
     */
    setLevel(level) {
        this.currentLevel = level;
    }

    /**
     * 获取日志级别名称
     */
    static getLevelName(level) {
        return LogLevelName[level] || 'UNKNOWN';
    }

    /**
     * 获取日志级别值
     */
    static getLevel(name) {
        const key = Object.keys(LogLevelName).find(k => LogLevelName[k] === name);
        return key ? parseInt(key) : LogLevel.INFO;
    }
}

/**
 * 全局日志记录器实例映射表
 */
const loggers = {};

/**
 * 获取日志记录器
 * @param {string} moduleName - 模块名称
 * @param {Object} options - 配置选项
 * @returns {Logger}
 */
function getLogger(moduleName = 'APP', options = {}) {
    const key = moduleName;

    if (!loggers[key]) {
        const mergedOptions = {
            moduleName,
            level: options.level || Logger.getLevel(config.getLogLevel()),
            enableConsole: options.enableConsole !== false,
            enableFile: options.enableFile || false,
            ...options,
        };

        loggers[key] = new Logger(mergedOptions);
    }

    return loggers[key];
}

/**
 * 创建一个新的日志记录器实例
 * @param {string} moduleName - 模块名称
 * @param {Object} options - 配置选项
 * @returns {Logger}
 */
function createLogger(moduleName = 'APP', options = {}) {
    return new Logger({
        moduleName,
        level: options.level || Logger.getLevel(config.getLogLevel()),
        enableConsole: options.enableConsole !== false,
        enableFile: options.enableFile || false,
        ...options,
    });
}

module.exports = {
    Logger,
    LogLevel,
    LogLevelName,
    getLogger,
    createLogger,
};
