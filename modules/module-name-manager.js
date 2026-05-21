const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getLogger } = require('../logger');

const logger = getLogger('MODULE_NAME_MANAGER');

const MODULE_META = {
    sensoryIntegration: {
        key: 'sensoryIntegration',
        canonicalDomain: '感知觉统合',
        defaultName: config.moduleNameConfig.defaults.moduleNames.sensoryIntegration,
        entryType: 'domain',
        color: '#FA8278',
        icon: 'brain',
    },
    executiveFunction: {
        key: 'executiveFunction',
        canonicalDomain: '执行功能',
        defaultName: config.moduleNameConfig.defaults.moduleNames.executiveFunction,
        entryType: 'domain',
        color: '#08C4EB',
        icon: 'tasks',
    },
    socialCommunication: {
        key: 'socialCommunication',
        canonicalDomain: '社交沟通',
        defaultName: config.moduleNameConfig.defaults.moduleNames.socialCommunication,
        entryType: 'domain',
        color: '#CCDF5E',
        icon: 'users',
    },
    adaptiveLiving: {
        key: 'adaptiveLiving',
        canonicalDomain: '生活适应',
        defaultName: config.moduleNameConfig.defaults.moduleNames.adaptiveLiving,
        entryType: 'domain',
        color: '#0FD4C2',
        icon: 'lightbulb',
    },
    emotionalBehavior: {
        key: 'emotionalBehavior',
        canonicalDomain: '情绪行为',
        defaultName: config.moduleNameConfig.defaults.moduleNames.emotionalBehavior,
        entryType: 'domain',
        color: '#FFCB3A',
        icon: 'grin-beam',
    },
    iep: {
        key: 'iep',
        canonicalDomain: '综合测评',
        defaultName: config.moduleNameConfig.defaults.moduleNames.iep,
        entryType: 'iep',
        color: '#7EA7FF',
        icon: 'clipboard-check',
    },
    psy: {
        key: 'psy',
        canonicalDomain: 'AI心理测评',
        defaultName: config.moduleNameConfig.defaults.moduleNames.psy,
        entryType: 'psy',
        color: '#DF99F0',
        icon: 'heart',
    },
};

const MODULE_KEYS = Object.keys(MODULE_META);

function ensureConfigDirExists() {
    const configPath = config.getModuleNameConfigPath();
    const configDir = path.dirname(configPath);

    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        logger.debug('Module name config directory created', { path: configDir });
    }
}

function loadModuleNameConfig() {
    try {
        const configPath = config.getModuleNameConfigPath();

        if (!fs.existsSync(configPath)) {
            return null;
        }

        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        logger.warn('Failed to load module name config', { error: error.message });
        return null;
    }
}

function normalizeModuleNames(moduleNames = {}) {
    const normalized = {};

    MODULE_KEYS.forEach((key) => {
        const rawValue = typeof moduleNames[key] === 'string'
            ? moduleNames[key].trim()
            : '';

        normalized[key] = rawValue || MODULE_META[key].defaultName;
    });

    return normalized;
}

function validateModuleNames(moduleNames) {
    const normalized = {};
    const usedValues = new Set();

    MODULE_KEYS.forEach((key) => {
        if (typeof moduleNames[key] !== 'string') {
            throw new Error('Module name cannot be empty');
        }

        const value = moduleNames[key].trim();
        if (!value) {
            throw new Error('Module name cannot be empty');
        }

        if (usedValues.has(value)) {
            throw new Error('Module names must be unique');
        }

        usedValues.add(value);
        normalized[key] = value;
    });

    return normalized;
}

function saveModuleNameConfig(configToSave) {
    ensureConfigDirExists();
    const configPath = config.getModuleNameConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf8');
    logger.info('Module name config saved', { path: configPath });
}

function getModuleNameConfig() {
    const customConfig = loadModuleNameConfig();

    return {
        moduleNames: normalizeModuleNames(customConfig?.moduleNames),
        timestamp: customConfig?.timestamp || new Date().toISOString(),
    };
}

function setModuleNameConfig(newConfig) {
    if (!newConfig || typeof newConfig !== 'object' || !newConfig.moduleNames) {
        throw new Error('Invalid module name configuration');
    }

    const validatedNames = validateModuleNames(newConfig.moduleNames);
    const configToSave = {
        moduleNames: validatedNames,
        timestamp: new Date().toISOString(),
    };

    saveModuleNameConfig(configToSave);
    return configToSave;
}

function getModuleMeta(moduleKey, moduleNames = null) {
    const meta = MODULE_META[moduleKey];
    if (!meta) {
        return null;
    }

    const resolvedNames = moduleNames || getModuleNameConfig().moduleNames;
    const displayName = resolvedNames[moduleKey] || meta.defaultName;

    return {
        ...meta,
        name: displayName,
        displayName,
    };
}

function getAllModuleMeta(moduleNames = null) {
    return MODULE_KEYS.map((key) => getModuleMeta(key, moduleNames));
}

function resolveModuleKey({ moduleKey, domain } = {}) {
    if (moduleKey && MODULE_META[moduleKey]) {
        return moduleKey;
    }

    if (!domain) {
        return null;
    }

    const normalizedDomain = String(domain).trim();
    const currentModuleNames = getModuleNameConfig().moduleNames;

    const matchedMeta = Object.values(MODULE_META).find((meta) => {
        const configuredName = currentModuleNames[meta.key];

        return normalizedDomain === meta.defaultName
            || normalizedDomain === meta.canonicalDomain
            || normalizedDomain === configuredName;
    });

    return matchedMeta ? matchedMeta.key : null;
}

module.exports = {
    MODULE_META,
    MODULE_KEYS,
    getModuleNameConfig,
    setModuleNameConfig,
    loadModuleNameConfig,
    saveModuleNameConfig,
    validateModuleNames,
    normalizeModuleNames,
    getModuleMeta,
    getAllModuleMeta,
    resolveModuleKey,
};
