/**
 * 使用统计模块
 * 实现用户对各应用模块使用频率和时间的记录追踪
 * 使用 sql.js（纯 JavaScript SQLite 实现）
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getLogger } = require('../logger');

const logger = getLogger('USAGE_STATS');

let SQL = null;
let db = null;
let isInitialized = false;

/**
 * 获取数据库文件路径
 */
function getDatabasePath() {
    let dbPath;
    if (process.platform === 'win32') {
        dbPath = path.join(
            app.getPath('appData'),
            '特殊教育多模态干预系统',
            'data',
            'usage-stats.db'
        );
    } else {
        dbPath = path.join(
            app.getPath('home'),
            'Library',
            'Application Support',
            '特殊教育多模态干预系统',
            'data',
            'usage-stats.db'
        );
    }
    return dbPath;
}

/**
 * 确保数据库目录存在
 */
function ensureDatabaseDirExists() {
    const dbPath = getDatabasePath();
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
}

/**
 * 初始化数据库
 */
async function initializeDatabase() {
    try {
        // 初始化 sql.js
        if (!SQL) {
            SQL = await initSqlJs();
        }

        ensureDatabaseDirExists();
        const dbPath = getDatabasePath();

        // 尝试加载现有数据库文件
        let fileBuffer = null;
        if (fs.existsSync(dbPath)) {
            fileBuffer = fs.readFileSync(dbPath);
        }

        // 创建或加载数据库
        db = new SQL.Database(fileBuffer);

        // 创建表
        db.run(`
            CREATE TABLE IF NOT EXISTS usage_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_name TEXT NOT NULL,
                app_path TEXT,
                category TEXT,
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                duration_ms INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS daily_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_name TEXT NOT NULL,
                stats_date DATE NOT NULL,
                usage_count INTEGER DEFAULT 0,
                total_duration_ms INTEGER DEFAULT 0,
                last_used DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(app_name, stats_date)
            );
        `);

        // 保存数据库到文件
        saveDatabase();

        isInitialized = true;
        logger.info('Usage statistics database initialized', { path: dbPath });
    } catch (error) {
        logger.error('Failed to initialize usage statistics database', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 保存数据库到文件
 */
function saveDatabase() {
    if (!db) return;

    try {
        const dbPath = getDatabasePath();
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    } catch (error) {
        logger.error('Failed to save database', { error: error.message });
    }
}

/**
 * 确保数据库已初始化
 */
async function ensureInitialized() {
    if (!isInitialized) {
        await initializeDatabase();
    }
}

/**
 * 记录应用使用开始
 */
async function recordUsageStart(appData) {
    try {
        await ensureInitialized();

        const {
            appName,
            appPath = null,
            category = null,
            startTime = new Date().toISOString()
        } = appData;

        const stmt = db.prepare(`
            INSERT INTO usage_records (app_name, app_path, category, start_time)
            VALUES (?, ?, ?, ?)
        `);

        stmt.bind([appName, appPath, category, startTime]);
        stmt.step();
        stmt.free();

        // 获取插入的记录ID
        const idResult = db.exec('SELECT last_insert_rowid() as id');
        const recordId = idResult[0]?.values[0]?.[0] || 0;

        saveDatabase();

        logger.debug('Usage record started', {
            appName,
            recordId
        });

        return {
            recordId,
            startTime
        };
    } catch (error) {
        logger.error('Failed to record usage start', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 记录应用使用结束
 */
async function recordUsageEnd(recordData) {
    try {
        await ensureInitialized();

        const {
            recordId,
            endTime = new Date().toISOString()
        } = recordData;

        // 获取开始时间，计算使用时长
        const result = db.exec(
            'SELECT start_time FROM usage_records WHERE id = ?',
            [recordId]
        );

        if (!result[0] || !result[0].values || result[0].values.length === 0) {
            throw new Error('Usage record not found');
        }

        const startTime = new Date(result[0].values[0][0]);
        const endDateTime = new Date(endTime);
        const durationMs = endDateTime - startTime;

        // 更新使用记录
        const stmt = db.prepare(`
            UPDATE usage_records
            SET end_time = ?, duration_ms = ?
            WHERE id = ?
        `);

        stmt.bind([endTime, durationMs, recordId]);
        stmt.step();
        stmt.free();

        saveDatabase();

        logger.debug('Usage record ended', {
            recordId,
            durationMs
        });

        return {
            recordId,
            endTime,
            durationMs
        };
    } catch (error) {
        logger.error('Failed to record usage end', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 获取使用统计数据
 */
async function getUsageStats(filters = {}) {
    try {
        await ensureInitialized();

        const {
            appName = null,
            startDate = null,
            endDate = null,
            category = null,
            limitDays = 30
        } = filters;

        // 构建查询语句
        let query = `
            SELECT 
                app_name,
                COUNT(*) as usage_count,
                SUM(duration_ms) as total_duration_ms,
                AVG(duration_ms) as avg_duration_ms,
                MAX(end_time) as last_used,
                MIN(start_time) as first_used
            FROM usage_records
            WHERE 1=1
        `;

        const params = [];

        if (appName) {
            query += ' AND app_name = ?';
            params.push(appName);
        }

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        // 默认限制最近30天的数据
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - limitDays);

        if (startDate) {
            query += ' AND start_time >= ?';
            params.push(startDate);
        } else {
            query += ' AND start_time >= ?';
            params.push(daysAgo.toISOString());
        }

        if (endDate) {
            query += ' AND start_time <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY app_name ORDER BY usage_count DESC';

        const stmt = db.prepare(query);
        stmt.bind(params);

        const stats = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            stats.push(row);
        }
        stmt.free();

        // 转换时间单位为秒
        const convertedStats = stats.map(stat => ({
            ...stat,
            total_duration_sec: stat.total_duration_ms ? Math.round(stat.total_duration_ms / 1000) : 0,
            avg_duration_sec: stat.avg_duration_ms ? Math.round(stat.avg_duration_ms / 1000) : 0
        }));

        logger.info('Usage statistics retrieved', {
            count: convertedStats.length,
            filters
        });

        return convertedStats;
    } catch (error) {
        logger.error('Failed to get usage statistics', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 获取分类统计
 */
async function getCategoryStats(filters = {}) {
    try {
        await ensureInitialized();

        const {
            startDate = null,
            endDate = null,
            limitDays = 30
        } = filters;

        let query = `
            SELECT 
                category,
                COUNT(*) as usage_count,
                SUM(duration_ms) as total_duration_ms,
                COUNT(DISTINCT app_name) as app_count
            FROM usage_records
            WHERE category IS NOT NULL AND 1=1
        `;

        const params = [];

        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - limitDays);

        if (startDate) {
            query += ' AND start_time >= ?';
            params.push(startDate);
        } else {
            query += ' AND start_time >= ?';
            params.push(daysAgo.toISOString());
        }

        if (endDate) {
            query += ' AND start_time <= ?';
            params.push(endDate);
        }

        query += ' GROUP BY category ORDER BY usage_count DESC';

        const stmt = db.prepare(query);
        stmt.bind(params);

        const stats = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            stats.push(row);
        }
        stmt.free();

        const convertedStats = stats.map(stat => ({
            ...stat,
            total_duration_sec: stat.total_duration_ms ? Math.round(stat.total_duration_ms / 1000) : 0
        }));

        logger.info('Category statistics retrieved', {
            count: convertedStats.length
        });

        return convertedStats;
    } catch (error) {
        logger.error('Failed to get category statistics', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 清除使用统计数据
 */
async function clearUsageStats(filters = {}) {
    try {
        await ensureInitialized();

        const { olderThanDays = 90, appName = null } = filters;

        let query = 'DELETE FROM usage_records WHERE 1=1';
        const params = [];

        if (appName) {
            query += ' AND app_name = ?';
            params.push(appName);
        }

        // 默认清除90天之前的数据
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        query += ' AND start_time < ?';
        params.push(cutoffDate.toISOString());

        const stmt = db.prepare(query);
        stmt.bind(params);
        stmt.step();
        stmt.free();

        saveDatabase();

        logger.info('Usage statistics cleared', {
            olderThanDays
        });

        return {
            success: true
        };
    } catch (error) {
        logger.error('Failed to clear usage statistics', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 关闭数据库
 */
function closeDatabase() {
    if (db) {
        try {
            saveDatabase();
            db.close();
            db = null;
            isInitialized = false;
            logger.info('Usage statistics database closed');
        } catch (error) {
            logger.error('Failed to close usage statistics database', {
                error: error.message
            });
        }
    }
}

/**
 * 初始化模块
 */
async function initialize() {
    try {
        await initializeDatabase();
        logger.info('Usage statistics module initialized');
    } catch (error) {
        logger.error('Failed to initialize usage statistics module', {
            error: error.message
        });
    }
}

module.exports = {
    getDatabasePath,
    initializeDatabase,
    recordUsageStart,
    recordUsageEnd,
    getUsageStats,
    getCategoryStats,
    clearUsageStats,
    closeDatabase,
    initialize
};
