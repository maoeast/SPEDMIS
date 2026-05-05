const fs = require('fs');
const path = require('path');

jest.mock('electron', () => ({
    app: {
        getPath: jest.fn((pathName) => {
            if (pathName === 'appData') {
                return 'C:\\Users\\test\\AppData\\Roaming';
            }
            return '/tmp/spedmis-permission-test-home';
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

const permissionManager = require('../modules/permission-manager');

const TEST_HOME_DIR = '/tmp/spedmis-permission-test-home';
const TEST_CONFIG_DIR = path.join(
    TEST_HOME_DIR,
    'Library',
    'Application Support',
    '特殊教育多模态干预系统'
);

describe('Permission Manager Module', () => {
    beforeEach(() => {
        fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
        jest.clearAllMocks();
    });

    afterAll(() => {
        fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    });

    test('should initialize permission config with default permissions', async () => {
        await permissionManager.initializePermissions();

        const config = permissionManager.getPermissionConfig();

        expect(config).toBeTruthy();
        expect(config.permissions.setProductName.requiresAuth).toBe(true);
        expect(config.permissions.getUsageStats.requiresAuth).toBe(false);
        expect(config.sessionTokens).toEqual({});
    });

    test('should verify the default admin password and issue a valid session token', async () => {
        await permissionManager.initializePermissions();

        const result = permissionManager.verifyAdminPassword('299451');

        expect(result.success).toBe(true);
        expect(result.token).toMatch(/^[a-f0-9]{64}$/);
        expect(permissionManager.verifySessionToken(result.token)).toBe(true);
    });

    test('should require admin authentication for protected actions', async () => {
        await permissionManager.initializePermissions();

        const denied = permissionManager.checkPermission('setProductName');

        expect(denied).toEqual({
            allowed: false,
            message: '需要管理员认证',
            requiresAuth: true,
        });

        const authResult = permissionManager.verifyAdminPassword('299451');
        const allowed = permissionManager.checkPermission('setProductName', authResult.token);

        expect(allowed).toEqual({
            allowed: true,
            message: '权限验证通过',
        });
    });

    test('should allow public actions without authentication', async () => {
        await permissionManager.initializePermissions();

        expect(permissionManager.checkPermission('getUsageStats')).toEqual({
            allowed: true,
            message: '不需要认证',
        });

        expect(permissionManager.checkPermission('unknownAction')).toEqual({
            allowed: true,
            message: '无权限限制',
        });
    });

    test('should revoke sessions and invalidate old tokens after password update', async () => {
        await permissionManager.initializePermissions();

        const loginResult = permissionManager.verifyAdminPassword('299451');
        expect(permissionManager.revokeSession(loginResult.token)).toBe(true);
        expect(permissionManager.verifySessionToken(loginResult.token)).toBe(false);

        const secondLogin = permissionManager.verifyAdminPassword('299451');
        const updateResult = permissionManager.updateAdminPassword('299451', 'new-password-123');

        expect(updateResult.success).toBe(true);
        expect(permissionManager.verifySessionToken(secondLogin.token)).toBe(false);

        const oldPasswordResult = permissionManager.verifyAdminPassword('299451');
        expect(oldPasswordResult.success).toBe(false);

        const newPasswordResult = permissionManager.verifyAdminPassword('new-password-123');
        expect(newPasswordResult.success).toBe(true);
    });
});
