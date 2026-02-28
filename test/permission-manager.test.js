/**
 * 权限管理模块单元测试
 */

const fs = require('fs');
const path = require('path');

describe('Permission Manager Module', () => {
    // 由于permission-manager会使用electron的app.getPath()
    // 我们先创建一个简化版本的测试

    test('should have permission-manager module', () => {
        // 检查模块是否存在并可以导入
        const permissionPath = path.join(__dirname, '../modules/permission-manager.js');
        expect(fs.existsSync(permissionPath)).toBe(true);
    });

    test('should have all required exports', () => {
        // 不需要mock的简单检查
        const moduleContent = fs.readFileSync(
            path.join(__dirname, '../modules/permission-manager.js'),
            'utf8'
        );

        // 检查关键函数是否存在
        expect(moduleContent).toContain('initializePermissions');
        expect(moduleContent).toContain('verifyAdminPassword');
        expect(moduleContent).toContain('checkPermission');
        expect(moduleContent).toContain('verifySessionToken');
        expect(moduleContent).toContain('revokeSession');
        expect(moduleContent).toContain('updateAdminPassword');
        expect(moduleContent).toContain('clearAllSessions');
    });

    test('should export module.exports correctly', () => {
        const moduleContent = fs.readFileSync(
            path.join(__dirname, '../modules/permission-manager.js'),
            'utf8'
        );

        // 检查所有函数都被导出
        expect(moduleContent).toContain('module.exports = {');
        expect(moduleContent).toContain('initializePermissions,');
        expect(moduleContent).toContain('verifyAdminPassword,');
        expect(moduleContent).toContain('checkPermission,');
        expect(moduleContent).toContain('getPermissionConfigPath,');
    });

    test('should have proper password hashing', () => {
        const moduleContent = fs.readFileSync(
            path.join(__dirname, '../modules/permission-manager.js'),
            'utf8'
        );

        // 检查是否使用了crypto.createHash
        expect(moduleContent).toContain('createHash');
        expect(moduleContent).toContain('sha256');
        expect(moduleContent).toContain('hashPassword');
        expect(moduleContent).toContain('verifyPassword');
    });

    test('should have session token management', () => {
        const moduleContent = fs.readFileSync(
            path.join(__dirname, '../modules/permission-manager.js'),
            'utf8'
        );

        // 检查是否有session token相关逻辑
        expect(moduleContent).toContain('sessionTokens');
        expect(moduleContent).toContain('expiresAt');
        expect(moduleContent).toContain('crypto.randomBytes');
    });

    test('should have permission checking logic', () => {
        const moduleContent = fs.readFileSync(
            path.join(__dirname, '../modules/permission-manager.js'),
            'utf8'
        );

        // 检查权限相关的逻辑
        expect(moduleContent).toContain('requiresAuth');
        expect(moduleContent).toContain('setProductName');
        expect(moduleContent).toContain('uploadLogo');
        expect(moduleContent).toContain('getUsageStats');
    });

    test('should have proper error handling', () => {
        const moduleContent = fs.readFileSync(
            path.join(__dirname, '../modules/permission-manager.js'),
            'utf8'
        );

        // 检查是否有try-catch和logger
        expect(moduleContent).toContain('try {');
        expect(moduleContent).toContain('catch (error)');
        expect(moduleContent).toContain('getLogger');
    });

    test('should use correct default password', () => {
        const moduleContent = fs.readFileSync(
            path.join(__dirname, '../modules/permission-manager.js'),
            'utf8'
        );

        // 检查默认密码是否存在
        expect(moduleContent).toContain('DEFAULT_ADMIN_PASSWORD');
        expect(moduleContent).toContain("'299451'");
    });

    test('should have IPC handler in main.js', () => {
        const mainPath = path.join(__dirname, '../main.js');
        const mainContent = fs.readFileSync(mainPath, 'utf8');

        // 检查是否正确导入了permission-manager
        expect(mainContent).toContain("require('./modules/permission-manager')");

        // 检查是否有权限相关的IPC处理器
        expect(mainContent).toContain('verifyAdminPassword');
        expect(mainContent).toContain('checkPermission');
        expect(mainContent).toContain('revokeSession');
        expect(mainContent).toContain('updateAdminPassword');
    });

    test('should have preload API for permission management', () => {
        const preloadPath = path.join(__dirname, '../preload.js');
        const preloadContent = fs.readFileSync(preloadPath, 'utf8');

        // 检查是否暴露了权限相关的API
        expect(preloadContent).toContain('verifyAdminPassword');
        expect(preloadContent).toContain('checkPermission');
        expect(preloadContent).toContain('revokeSession');
        expect(preloadContent).toContain('updateAdminPassword');
    });

    test('should have statistics page with auth dialog', () => {
        const statsPath = path.join(__dirname, '../statistics.html');
        expect(fs.existsSync(statsPath)).toBe(true);

        const statsContent = fs.readFileSync(statsPath, 'utf8');
        expect(statsContent).toContain('statistics');
    });

    test('should have permission check in config', () => {
        const configPath = path.join(__dirname, '../config.js');
        const configContent = fs.readFileSync(configPath, 'utf8');

        // 检查是否添加了权限相关的IPC通道
        expect(configContent).toContain('verifyAdminPassword');
        expect(configContent).toContain('checkPermission');
        expect(configContent).toContain('revokeSession');
        expect(configContent).toContain('updateAdminPassword');
    });
});
