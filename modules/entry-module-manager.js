const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getLogger } = require('../logger');

const logger = getLogger('ENTRY_MODULE_MANAGER');

function normalizeSelectedModule(selectedModule) {
    if (config.entryModuleConfig.supportedModules.includes(selectedModule)) {
        return selectedModule;
    }

    return 'none';
}

function ensureConfigDirExists() {
    const configPath = config.getEntryModuleConfigPath();
    const configDir = path.dirname(configPath);

    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        logger.debug('Entry module config directory created', { path: configDir });
    }
}

function loadEntryModuleConfig() {
    try {
        const configPath = config.getEntryModuleConfigPath();

        if (!fs.existsSync(configPath)) {
            return null;
        }

        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        logger.warn('Failed to load entry module config', { error: error.message });
        return null;
    }
}

function saveEntryModuleConfig(entryModuleSettings) {
    ensureConfigDirExists();

    const configPath = config.getEntryModuleConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(entryModuleSettings, null, 2), 'utf8');
    logger.info('Entry module config saved', { path: configPath });
    return true;
}

function getEntryModuleConfig() {
    const customConfig = loadEntryModuleConfig();
    const selectedModule = normalizeSelectedModule(
        customConfig?.selectedModule ?? config.entryModuleConfig.defaults.selectedModule
    );

    return {
        selectedModule,
    };
}

function setEntryModuleConfig(newConfig) {
    if (!newConfig || typeof newConfig !== 'object') {
        throw new Error('Invalid entry module configuration');
    }

    const configToSave = {
        selectedModule: normalizeSelectedModule(newConfig.selectedModule),
    };

    saveEntryModuleConfig(configToSave);
    return configToSave;
}

module.exports = {
    getEntryModuleConfig,
    setEntryModuleConfig,
    loadEntryModuleConfig,
    saveEntryModuleConfig,
    normalizeSelectedModule,
};
