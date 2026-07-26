const fs = require('fs');
const os = require('os');
const path = require('path');

// 用真实可写的临时目录，避免 entry-module-manager.test.js 那种 C:\Users\test 的 EPERM 陷阱。
// 命名以 mock 开头：jest.mock() 工厂被提升，只允许引用以 mock 为前缀的外层变量（惰性求值）。
const mockAppDataRoot = path.join(os.tmpdir(), 'spedmis-ai-feature-flags-test');

jest.mock('electron', () => ({
    app: {
        getPath: jest.fn((pathName) => {
            if (pathName === 'appData') {
                return mockAppDataRoot;
            }
            return require('path').join(require('os').tmpdir(), 'spedmis-ai-feature-flags-home');
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
const aiFeatureFlagsManager = require('../modules/ai-feature-flags-manager');

const TEST_CONFIG_DIR = path.join(
    mockAppDataRoot,
    config.activationConfig.appDataDirName,
    config.productNameConfig.configDirName
);

const ALL_FALSE = {
    agentManagementEnabled: false,
    knowledgeSectionVisible: false,
    budgetSectionVisible: false,
};

describe('AI Feature Flags Manager', () => {
    beforeEach(() => {
        fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
        jest.clearAllMocks();
    });

    afterAll(() => {
        fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    });

    test('should default to all sections hidden', () => {
        expect(aiFeatureFlagsManager.getAiFeatureFlags()).toEqual(ALL_FALSE);
    });

    test('should persist agent management enabled and read it back', () => {
        aiFeatureFlagsManager.setAiFeatureFlags({ agentManagementEnabled: true });

        expect(aiFeatureFlagsManager.getAiFeatureFlags()).toEqual({
            agentManagementEnabled: true,
            knowledgeSectionVisible: false,
            budgetSectionVisible: false,
        });
    });

    test('should persist knowledge section visible', () => {
        aiFeatureFlagsManager.setAiFeatureFlags({ knowledgeSectionVisible: true });

        expect(aiFeatureFlagsManager.getAiFeatureFlags()).toEqual({
            agentManagementEnabled: false,
            knowledgeSectionVisible: true,
            budgetSectionVisible: false,
        });
    });

    test('should persist budget section visible', () => {
        aiFeatureFlagsManager.setAiFeatureFlags({ budgetSectionVisible: true });

        expect(aiFeatureFlagsManager.getAiFeatureFlags()).toEqual({
            agentManagementEnabled: false,
            knowledgeSectionVisible: false,
            budgetSectionVisible: true,
        });
    });

    test('should preserve other flags when only one is updated (merge)', () => {
        aiFeatureFlagsManager.setAiFeatureFlags({ agentManagementEnabled: true });
        aiFeatureFlagsManager.setAiFeatureFlags({ knowledgeSectionVisible: true });

        expect(aiFeatureFlagsManager.getAiFeatureFlags()).toEqual({
            agentManagementEnabled: true,
            knowledgeSectionVisible: true,
            budgetSectionVisible: false,
        });
    });

    test('should persist agent management disabled explicitly', () => {
        aiFeatureFlagsManager.setAiFeatureFlags({ agentManagementEnabled: true });
        aiFeatureFlagsManager.setAiFeatureFlags({ agentManagementEnabled: false });

        expect(aiFeatureFlagsManager.getAiFeatureFlags()).toEqual(ALL_FALSE);
    });

    test('should coerce non-boolean values to a strict boolean on write', () => {
        aiFeatureFlagsManager.setAiFeatureFlags({ agentManagementEnabled: 'yes' });
        const persisted = JSON.parse(
            fs.readFileSync(config.getAiFeatureFlagsConfigPath(), 'utf8')
        );

        expect(persisted).toEqual({
            agentManagementEnabled: true,
            knowledgeSectionVisible: false,
            budgetSectionVisible: false,
        });
        expect(aiFeatureFlagsManager.getAiFeatureFlags()).toEqual({
            agentManagementEnabled: true,
            knowledgeSectionVisible: false,
            budgetSectionVisible: false,
        });
    });

    test('should fall back to defaults when the config file is corrupt', () => {
        fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
        fs.writeFileSync(config.getAiFeatureFlagsConfigPath(), '{ not valid json', 'utf8');

        expect(aiFeatureFlagsManager.getAiFeatureFlags()).toEqual(ALL_FALSE);
    });

    test('should reject non-object configuration payloads', () => {
        expect(() => aiFeatureFlagsManager.setAiFeatureFlags(null)).toThrow();
        expect(() => aiFeatureFlagsManager.setAiFeatureFlags('nope')).toThrow();
    });
});
