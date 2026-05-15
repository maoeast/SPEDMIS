const path = require('path');

jest.mock('electron', () => ({
    app: {
        getPath: jest.fn((pathName) => {
            if (pathName === 'appData') {
                return '/tmp/spedmis-appdata';
            }
            return '/tmp/spedmis-home';
        })
    }
}));

const { app } = require('electron');
const config = require('../config');

describe('config module', () => {
    const originalEnv = process.env.NODE_ENV;
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalEnv;
        }

        Object.defineProperty(process, 'platform', platformDescriptor);
        jest.clearAllMocks();
    });

    test('should expose core activation settings', () => {
        expect(config.appConfig.name).toBe('特殊教育多模态干预系统');
        expect(config.activationConfig.activationCodeLength).toBe(64);
        expect(config.activationConfig.hashAlgorithm).toBe('sha256');
        expect(config.activationConfig.secretKey).toBeUndefined();
    });

    test('should build activation storage path from appData on Windows', () => {
        Object.defineProperty(process, 'platform', {
            value: 'win32',
            configurable: true,
        });

        const storagePath = config.getActivationStoragePath();

        expect(storagePath).toBe(
            path.join('/tmp/spedmis-appdata', '特殊教育多模态干预系统', 'activation.json')
        );
        expect(app.getPath).toHaveBeenCalledWith('appData');
    });

    test('should build product config path from home directory on non-Windows platforms', () => {
        Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true,
        });

        const productConfigPath = config.getProductNameConfigPath();

        expect(productConfigPath).toBe(
            path.join(
                '/tmp/spedmis-home',
                'Library',
                'Application Support',
                '特殊教育多模态干预系统',
                'config',
                'product-branding.json'
            )
        );
        expect(app.getPath).toHaveBeenCalledWith('home');
    });

    test('should build entry module config path from appData on Windows', () => {
        Object.defineProperty(process, 'platform', {
            value: 'win32',
            configurable: true,
        });

        const entryModuleConfigPath = config.getEntryModuleConfigPath();

        expect(entryModuleConfigPath).toBe(
            path.join(
                '/tmp/spedmis-appdata',
                '特殊教育多模态干预系统',
                'config',
                'entry-module.json'
            )
        );
        expect(app.getPath).toHaveBeenCalledWith('appData');
    });

    test('should return environment specific log levels', () => {
        process.env.NODE_ENV = 'production';
        expect(config.getEnvironment()).toBe('production');
        expect(config.getLogLevel()).toBe('warn');

        process.env.NODE_ENV = 'development';
        expect(config.getEnvironment()).toBe('development');
        expect(config.getLogLevel()).toBe('debug');
    });

    test('should expose expected IPC channels and logo settings', () => {
        expect(config.ipcChannels.activate).toBe('activate');
        expect(config.ipcChannels.verifyAdminPassword).toBe('verify-admin-password');
        expect(config.ipcChannels.updateAdminPassword).toBe('update-admin-password');
        expect(config.ipcChannels.getEntryModuleConfig).toBe('get-entry-module-config');
        expect(config.ipcChannels.setEntryModuleConfig).toBe('set-entry-module-config');
        expect(config.logoConfig.maxFileSize).toBe(2 * 1024 * 1024);
        expect(config.logoConfig.supportedFormats).toContain('.ico');
    });

    test('should keep representative icon mappings and executable extensions', () => {
        expect(config.fileExtensions.executable).toEqual(
            expect.arrayContaining(['.exe', '.bat', '.cmd'])
        );
        expect(config.appIconMap['APP001.png']).toBe('gjcj.png');
        expect(config.appIconMap['APP418.png']).toBe('qxgl.png');
    });
});
