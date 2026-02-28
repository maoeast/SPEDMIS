/**
 * 产品名称管理模块
 * 处理产品名称的读取、设置和配置文件操作
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const config = require('../config');
const { getLogger } = require('../logger');

const logger = getLogger('PRODUCT_NAME_MANAGER');

/**
 * 获取配置文件路径
 */
function getProductNameConfigPath() {
    let configPath;
    if (process.platform === 'win32') {
        configPath = path.join(
            app.getPath('appData'),
            config.activationConfig.appDataDirName,
            config.productNameConfig.configDirName,
            config.productNameConfig.configFileName
        );
    } else {
        configPath = path.join(
            app.getPath('home'),
            'Library',
            'Application Support',
            config.activationConfig.appDataDirName,
            config.productNameConfig.configDirName,
            config.productNameConfig.configFileName
        );
    }
    return configPath;
}

/**
 * 确保配置目录存在
 */
function ensureConfigDirExists() {
    try {
        const configPath = getConfigDirPath();
        if (!fs.existsSync(configPath)) {
            fs.mkdirSync(configPath, { recursive: true });
            logger.debug('Config directory created', { path: configPath });
        }
    } catch (error) {
        logger.error('Failed to create config directory', { error: error.message });
        throw error;
    }
}



/**
 * 从文件读取产品名称配置
 */
function loadProductNameConfig() {
    try {
        const configPath = getProductNameConfigPath();

        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            const customConfig = JSON.parse(data);
            logger.debug('Product name config loaded from file', {
                path: configPath
            });
            return customConfig;
        } else {
            logger.debug('No custom product name config found, using defaults');
            return null;
        }
    } catch (error) {
        logger.warn('Failed to load product name config', {
            error: error.message
        });
        return null;
    }
}

/**
 * 保存产品名称配置到文件
 */
function saveProductNameConfig(productConfig) {
    try {
        ensureConfigDirExists();

        const configPath = getProductNameConfigPath();
        const data = JSON.stringify(productConfig, null, 2);

        fs.writeFileSync(configPath, data, 'utf8');

        logger.info('Product name config saved', { path: configPath });
        return true;
    } catch (error) {
        logger.error('Failed to save product name config', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 获取产品名称配置（合并自定义和默认配置）
 */
function getProductNameConfig() {
    try {
        // 首先加载自定义配置
        const customConfig = loadProductNameConfig();

        // 如果有自定义配置，合并默认配置
        if (customConfig) {
            return {
                ...config.productNameConfig.defaults,
                ...customConfig,
                timestamp: customConfig.timestamp || new Date().toISOString()
            };
        }

        // 返回默认配置
        return {
            ...config.productNameConfig.defaults,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        logger.error('Failed to get product name config', {
            error: error.message
        });
        // 返回默认配置作为回退
        return config.productNameConfig.defaults;
    }
}

/**
 * 设置产品名称配置
 */
function setProductNameConfig(newConfig) {
    try {
        // 验证配置对象
        if (!newConfig || typeof newConfig !== 'object') {
            throw new Error('Invalid configuration object');
        }

        // 保留时间戳
        const configToSave = {
            ...newConfig,
            timestamp: new Date().toISOString()
        };

        // 保存到文件
        saveProductNameConfig(configToSave);

        logger.info('Product name config updated', {
            fullName: newConfig.fullName,
            shortName: newConfig.shortName
        });

        return configToSave;
    } catch (error) {
        logger.error('Failed to set product name config', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 获取产品全名
 */
function getFullName() {
    const productConfig = getProductNameConfig();
    return productConfig.fullName || config.productNameConfig.defaults.fullName;
}

/**
 * 获取产品短名称
 */
function getShortName() {
    const productConfig = getProductNameConfig();
    return productConfig.shortName || config.productNameConfig.defaults.shortName;
}

/**
 * 获取组织名称
 */
function getOrganization() {
    const productConfig = getProductNameConfig();
    return productConfig.organization || config.productNameConfig.defaults.organization;
}

/**
 * 获取英文产品名
 */
function getEngName() {
    const productConfig = getProductNameConfig();
    return productConfig.engName || config.productNameConfig.defaults.engName;
}

/**
 * 获取版权信息
 */
function getCopyright() {
    const productConfig = getProductNameConfig();
    return productConfig.copyright || config.productNameConfig.defaults.copyright;
}

/**
 * 重置为默认配置
 */
function resetToDefaults() {
    try {
        const configPath = getProductNameConfigPath();

        // 删除自定义配置文件
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
            logger.info('Product name config reset to defaults');
        }

        return config.productNameConfig.defaults;
    } catch (error) {
        logger.error('Failed to reset product name config', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 初始化产品名称管理器
 */
function initialize() {
    try {
        ensureConfigDirExists();
        const productConfig = getProductNameConfig();
        logger.info('Product name manager initialized', {
            fullName: productConfig.fullName
        });
    } catch (error) {
        logger.error('Failed to initialize product name manager', {
            error: error.message
        });
    }
}

/**
 * 获取配置目录路径
 */
function getConfigDirPath() {
    let configDirPath;
    if (process.platform === 'win32') {
        configDirPath = path.join(
            app.getPath('appData'),
            config.activationConfig.appDataDirName,
            config.productNameConfig.configDirName
        );
    } else {
        configDirPath = path.join(
            app.getPath('home'),
            'Library',
            'Application Support',
            config.activationConfig.appDataDirName,
            config.productNameConfig.configDirName
        );
    }
    return configDirPath;
}

module.exports = {
    getProductNameConfig,
    setProductNameConfig,
    getFullName,
    getShortName,
    getOrganization,
    getEngName,
    getCopyright,
    loadProductNameConfig,
    saveProductNameConfig,
    resetToDefaults,
    initialize,
    getConfigDirPath,
    ensureConfigDirExists
};
