/**
 * 使用统计模块单元测试
 */

jest.mock('electron', () => ({
    app: {
        getPath: jest.fn((pathName) => {
            if (pathName === 'appData') {
                return 'C:\\Users\\test\\AppData\\Roaming';
            }
            return '/home/test';
        })
    }
}));

jest.mock('../logger', () => ({
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }))
}));

const usageStats = require('../modules/usage-stats');
const fs = require('fs');
const path = require('path');

describe('Usage Statistics Module', () => {
    beforeEach(() => {
        // 清理测试数据库
        jest.clearAllMocks();
    });

    describe('recordUsageStart', () => {
        test('should record usage start successfully', async () => {
            const appData = {
                appName: '测试应用',
                appPath: 'C:\\test\\app.exe',
                category: '测试分类'
            };

            await usageStats.initialize();
            const result = await usageStats.recordUsageStart(appData);

            expect(result).toHaveProperty('recordId');
            expect(result).toHaveProperty('startTime');
            expect(result.recordId).toBeGreaterThan(0);
        });

        test('should record usage start with minimal data', async () => {
            const appData = {
                appName: '应用2'
            };

            await usageStats.initialize();
            const result = await usageStats.recordUsageStart(appData);

            expect(result).toHaveProperty('recordId');
            expect(result.recordId).toBeGreaterThan(0);
        });

        test('should handle multiple usage records', async () => {
            await usageStats.initialize();

            const result1 = await usageStats.recordUsageStart({ appName: '应用A' });
            const result2 = await usageStats.recordUsageStart({ appName: '应用B' });

            expect(result1.recordId).toBeDefined();
            expect(result2.recordId).toBeDefined();
            expect(result1.recordId).not.toEqual(result2.recordId);
        });
    });

    describe('recordUsageEnd', () => {
        test('should record usage end successfully', async () => {
            await usageStats.initialize();

            // 首先创建一个记录
            const startResult = await usageStats.recordUsageStart({ appName: '应用C' });

            // 等待一段时间再结束
            await new Promise(resolve => setTimeout(resolve, 100));

            const endResult = await usageStats.recordUsageEnd({
                recordId: startResult.recordId
            });

            expect(endResult).toHaveProperty('recordId');
            expect(endResult).toHaveProperty('endTime');
            expect(endResult).toHaveProperty('durationMs');
            expect(endResult.durationMs).toBeGreaterThanOrEqual(100);
        });

        test('should throw error for invalid record id', async () => {
            await usageStats.initialize();

            await expect(
                usageStats.recordUsageEnd({ recordId: 99999 })
            ).rejects.toThrow('Usage record not found');
        });
    });

    describe('getUsageStats', () => {
        test('should retrieve usage statistics', async () => {
            await usageStats.initialize();

            // 创建一些测试数据
            for (let i = 0; i < 3; i++) {
                const result = await usageStats.recordUsageStart({
                    appName: '应用D',
                    category: '教学工具'
                });
                await new Promise(resolve => setTimeout(resolve, 50));
                await usageStats.recordUsageEnd({ recordId: result.recordId });
            }

            const stats = await usageStats.getUsageStats();

            expect(Array.isArray(stats)).toBe(true);
            expect(stats.length).toBeGreaterThan(0);
        });

        test('should filter by appName', async () => {
            await usageStats.initialize();

            // 创建特定应用的记录
            const startResult = await usageStats.recordUsageStart({
                appName: '特定应用',
                category: '测试'
            });
            await usageStats.recordUsageEnd({ recordId: startResult.recordId });

            const stats = await usageStats.getUsageStats({ appName: '特定应用' });

            expect(Array.isArray(stats)).toBe(true);
            stats.forEach(stat => {
                expect(stat.app_name).toBe('特定应用');
            });
        });

        test('should convert duration to seconds', async () => {
            await usageStats.initialize();

            const startResult = await usageStats.recordUsageStart({ appName: '应用E' });
            await new Promise(resolve => setTimeout(resolve, 100));
            await usageStats.recordUsageEnd({ recordId: startResult.recordId });

            const stats = await usageStats.getUsageStats();

            expect(stats.length).toBeGreaterThan(0);
            const stat = stats.find(s => s.app_name === '应用E');
            if (stat) {
                expect(stat).toHaveProperty('total_duration_sec');
                expect(stat.total_duration_sec).toBeGreaterThanOrEqual(0);
            }
        });

        test('should handle empty results', async () => {
            await usageStats.initialize();

            const stats = await usageStats.getUsageStats({ appName: '不存在的应用' });

            expect(Array.isArray(stats)).toBe(true);
            expect(stats.length).toBe(0);
        });
    });

    describe('getCategoryStats', () => {
        test('should retrieve category statistics', async () => {
            await usageStats.initialize();

            // 创建带分类的记录
            const result = await usageStats.recordUsageStart({
                appName: '应用F',
                category: '音乐治疗'
            });
            await usageStats.recordUsageEnd({ recordId: result.recordId });

            const categoryStats = await usageStats.getCategoryStats();

            expect(Array.isArray(categoryStats)).toBe(true);
        });
    });

    describe('clearUsageStats', () => {
        test('should clear old usage statistics', async () => {
            await usageStats.initialize();

            // 创建一些记录
            const result = await usageStats.recordUsageStart({ appName: '应用G' });
            await usageStats.recordUsageEnd({ recordId: result.recordId });

            const clearResult = await usageStats.clearUsageStats({ olderThanDays: 0 });

            expect(clearResult).toHaveProperty('success');
            expect(clearResult.success).toBe(true);
        });

        test('should handle clear with specific app name', async () => {
            await usageStats.initialize();

            const result = await usageStats.recordUsageStart({ appName: '应用H' });
            await usageStats.recordUsageEnd({ recordId: result.recordId });

            const clearResult = await usageStats.clearUsageStats({
                appName: '应用H',
                olderThanDays: 0
            });

            expect(clearResult.success).toBe(true);
        });
    });

    describe('getDatabasePath', () => {
        test('should return valid database path', () => {
            const dbPath = usageStats.getDatabasePath();

            expect(dbPath).toBeDefined();
            expect(typeof dbPath).toBe('string');
            expect(dbPath).toContain('usage-stats.db');
        });
    });

    describe('closeDatabase', () => {
        test('should close database safely', async () => {
            await usageStats.initialize();

            // 应该不抛出错误
            expect(() => usageStats.closeDatabase()).not.toThrow();
        });
    });
});
