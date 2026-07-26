const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getLogger } = require('../logger');

const logger = getLogger('AI_FEATURE_FLAGS_MANAGER');

// 系统级可见性开关集合：新增 flag 只需在此追加一项，get/set 自动覆盖。
const FLAG_KEYS = ['agentManagementEnabled', 'knowledgeSectionVisible', 'budgetSectionVisible'];

function ensureConfigDirExists() {
    const configPath = config.getAiFeatureFlagsConfigPath();
    const configDir = path.dirname(configPath);

    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        logger.debug('AI feature flags config directory created', { path: configDir });
    }
}

function loadAiFeatureFlags() {
    try {
        const configPath = config.getAiFeatureFlagsConfigPath();

        if (!fs.existsSync(configPath)) {
            return null;
        }

        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        logger.warn('Failed to load AI feature flags', { error: error.message });
        return null;
    }
}

function saveAiFeatureFlags(featureFlags) {
    ensureConfigDirExists();

    const configPath = config.getAiFeatureFlagsConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(featureFlags, null, 2), 'utf8');
    logger.info('AI feature flags saved', { path: configPath });
    return true;
}

function getAiFeatureFlags() {
    const customConfig = loadAiFeatureFlags();
    const defaults = config.aiFeatureFlagsConfig.defaults;
    const result = {};

    for (const key of FLAG_KEYS) {
        result[key] = Boolean(customConfig?.[key] ?? defaults[key]);
    }

    return result;
}

function setAiFeatureFlags(newConfig) {
    if (!newConfig || typeof newConfig !== 'object') {
        throw new Error('Invalid AI feature flags configuration');
    }

    // 与已落盘内容 merge：只传部分 flag 时不会把其余 flag 重置为默认值。
    const existing = loadAiFeatureFlags() || {};
    const defaults = config.aiFeatureFlagsConfig.defaults;
    const configToSave = {};

    for (const key of FLAG_KEYS) {
        configToSave[key] = Boolean(newConfig[key] ?? existing[key] ?? defaults[key]);
    }

    saveAiFeatureFlags(configToSave);
    return configToSave;
}

module.exports = {
    getAiFeatureFlags,
    setAiFeatureFlags,
    loadAiFeatureFlags,
    saveAiFeatureFlags,
};
