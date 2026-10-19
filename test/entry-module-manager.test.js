const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('electron', () => {
    const os = require('os');
    const path = require('path');

    return {
        app: {
            getPath: jest.fn((pathName) => {
                if (pathName === 'appData') {
                    return path.join(os.tmpdir(), 'spedmis-entry-appdata');
                }
                return path.join(os.tmpdir(), 'spedmis-entry-home');
            })
        }
    };
});

jest.mock('../logger', () => ({
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }))
}));

const config = require('../config');
const entryModuleManager = require('../modules/entry-module-manager');

const TEST_APP_DATA_DIR = path.join(os.tmpdir(), 'spedmis-entry-appdata');
const TEST_CONFIG_DIRS = [
    path.join(TEST_APP_DATA_DIR, config.activationConfig.appDataDirName, config.productNameConfig.configDirName),
    path.join(os.tmpdir(), 'spedmis-entry-home', 'Library', 'Application Support', config.activationConfig.appDataDirName, config.productNameConfig.configDirName),
];

describe('Entry Module Manager', () => {
    beforeEach(() => {
        TEST_CONFIG_DIRS.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
        jest.clearAllMocks();
    });

    afterAll(() => {
        TEST_CONFIG_DIRS.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
    });

    test('should return iep as the default entry module', () => {
        const result = entryModuleManager.getEntryModuleConfig();

        expect(result).toEqual({
            selectedModule: 'iep',
        });
    });

    test('should normalize unsupported persisted values to none', () => {
        entryModuleManager.saveEntryModuleConfig({
            selectedModule: 'unknown-module',
        });

        const result = entryModuleManager.getEntryModuleConfig();

        expect(result).toEqual({
            selectedModule: 'none',
        });
    });

    test('should persist iep as the selected entry module', () => {
        entryModuleManager.setEntryModuleConfig({
            selectedModule: 'iep',
        });

        const result = entryModuleManager.getEntryModuleConfig();

        expect(result).toEqual({
            selectedModule: 'iep',
        });
    });

    test('should preserve a persisted psy selection', () => {
        entryModuleManager.setEntryModuleConfig({
            selectedModule: 'psy',
        });

        const result = entryModuleManager.getEntryModuleConfig();

        expect(result).toEqual({
            selectedModule: 'psy',
        });
    });
});
