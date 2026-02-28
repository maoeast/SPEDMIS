/**
 * 产品名称管理模块单元测试
 */

const productNameManager = require('../modules/product-name-manager');
const config = require('../config');

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

describe('Product Name Manager', () => {
    test('should get default product name config', () => {
        const config_ = productNameManager.getProductNameConfig();

        expect(config_).toBeDefined();
        expect(config_.fullName).toBe(config.productNameConfig.defaults.fullName);
        expect(config_.shortName).toBe(config.productNameConfig.defaults.shortName);
        expect(config_.organization).toBe(config.productNameConfig.defaults.organization);
    });

    test('should get full name correctly', () => {
        const fullName = productNameManager.getFullName();

        expect(fullName).toBe(config.productNameConfig.defaults.fullName);
        expect(typeof fullName).toBe('string');
        expect(fullName.length).toBeGreaterThan(0);
    });

    test('should get short name correctly', () => {
        const shortName = productNameManager.getShortName();

        expect(shortName).toBe(config.productNameConfig.defaults.shortName);
        expect(typeof shortName).toBe('string');
        expect(shortName.length).toBeGreaterThan(0);
    });

    test('should get organization correctly', () => {
        const organization = productNameManager.getOrganization();

        expect(organization).toBe(config.productNameConfig.defaults.organization);
        expect(typeof organization).toBe('string');
        expect(organization.length).toBeGreaterThan(0);
    });

    test('should have English name in default config', () => {
        const config_ = productNameManager.getProductNameConfig();
        expect(config_).toHaveProperty('engName');
        expect(config_.engName).toBe('Special Education Multimodal Intervention System');
    });

    test('should have copyright info in default config', () => {
        const config_ = productNameManager.getProductNameConfig();
        expect(config_).toHaveProperty('copyright');
        expect(config_.copyright).toBe('©2013-2025');
    });

    test('should get English name correctly', () => {
        const engName = productNameManager.getEngName();
        expect(engName).toBe('Special Education Multimodal Intervention System');
        expect(typeof engName).toBe('string');
        expect(engName.length).toBeGreaterThan(0);
    });

    test('should get copyright correctly', () => {
        const copyright = productNameManager.getCopyright();
        expect(copyright).toBe('©2013-2025');
        expect(typeof copyright).toBe('string');
        expect(copyright.length).toBeGreaterThan(0);
    });

    test('should initialize product name manager without errors', () => {
        expect(() => {
            productNameManager.initialize();
        }).not.toThrow();
    });

    test('should have valid config directory path', () => {
        const configDirPath = productNameManager.getConfigDirPath();

        expect(configDirPath).toBeDefined();
        expect(typeof configDirPath).toBe('string');
        expect(configDirPath.length).toBeGreaterThan(0);
    });
});
