const fs = require('fs');
const path = require('path');

jest.mock('electron', () => ({
    app: {
        getPath: jest.fn((pathName) => {
            if (pathName === 'appData') {
                return 'C:\\Users\\test\\AppData\\Roaming';
            }
            return '/tmp/spedmis-entry-home';
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

const config = require('../config');
const entryModuleManager = require('../modules/entry-module-manager');

const TEST_CONFIG_DIR = path.join(
    'C:\\Users\\test\\AppData\\Roaming',
    config.activationConfig.appDataDirName,
    config.productNameConfig.configDirName
);

describe('Entry Module Manager', () => {
    beforeEach(() => {
        fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
        jest.clearAllMocks();
    });

    afterAll(() => {
        fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
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
