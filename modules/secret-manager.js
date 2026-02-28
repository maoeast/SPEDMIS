/**
 * 密钥管理模块
 * 
 * 负责安全地加载和管理应用中的所有敏感密钥：
 * 1. 激活系统密钥（SECRET_KEY）
 * 2. AES加密密钥
 * 3. 初始化向量（IV）
 * 
 * 密钥存储策略：
 * - 开发环境：从.env文件读取（便于开发）
 * - 生产环境：从系统环境变量读取（更安全）
 * - 备用方案：内置默认值（仅用于演示环境）
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getLogger } = require('../logger');

const logger = getLogger('SECRET_MANAGER');

/**
 * 密钥配置对象
 * 生产环境必须正确配置这些密钥
 */
let secretConfig = {
    // 激活系统密钥（用于生成激活码）
    // 长度要求：32字符以上
    // 重要：修改此密钥会导致所有已颁发的激活码失效
    activationSecretKey: null,

    // AES-256-GCM加密密钥
    // 长度：32字节（256位）
    // 生成方法：crypto.randomBytes(32).toString('hex')
    encryptionKey: null,

    // AES-256-GCM初始化向量
    // 长度：16字节（128位）
    // 生成方法：crypto.randomBytes(16).toString('hex')
    encryptionIV: null,

    // 环境标识
    nodeEnv: process.env.NODE_ENV || 'development'
};

/**
 * 从.env文件加载环境变量
 * 仅在开发环境使用
 */
function loadEnvFile() {
    const envPath = path.join(__dirname, '..', '.env');

    if (!fs.existsSync(envPath)) {
        logger.warn('Environment file not found', { path: envPath });
        return {};
    }

    try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envVars = {};

        envContent.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, value] = trimmed.split('=');
                if (key && value) {
                    envVars[key.trim()] = value.trim();
                }
            }
        });

        return envVars;
    } catch (error) {
        logger.error('Failed to load .env file', { error: error.message });
        return {};
    }
}

/**
 * 初始化密钥管理器
 * 按优先级加载密钥：嵌入式密钥 > 系统环境变量 > .env文件 > 内置默认值
 */
function initialize() {
    logger.info('Initializing secret manager', { env: secretConfig.nodeEnv });

    // 优先级1：尝试从嵌入式密钥配置加载（生产环境首选）
    try {
        const path = require('path');
        const fs = require('fs');
        const embeddedSecretsPath = path.join(__dirname, '..', 'embedded-secrets.js');

        if (fs.existsSync(embeddedSecretsPath)) {
            const embeddedSecrets = require(embeddedSecretsPath);

            if (embeddedSecrets.activationSecretKey) {
                secretConfig.activationSecretKey = embeddedSecrets.activationSecretKey;
                logger.info('Activation secret key loaded from embedded configuration');
            }

            if (embeddedSecrets.encryptionKey) {
                secretConfig.encryptionKey = embeddedSecrets.encryptionKey;
                logger.info('Encryption key loaded from embedded configuration');
            }

            if (embeddedSecrets.encryptionIV) {
                secretConfig.encryptionIV = embeddedSecrets.encryptionIV;
                logger.info('Encryption IV loaded from embedded configuration');
            }

            // 如果成功从嵌入式配置加载了密钥，直接返回
            if (secretConfig.activationSecretKey && secretConfig.encryptionKey && secretConfig.encryptionIV) {
                validateKeys();
                logger.info('Secret manager initialized successfully with embedded secrets');
                return;
            }
        }
    } catch (error) {
        logger.warn('Failed to load embedded secrets', { error: error.message });
    }

    // 优先级2：系统环境变量（用于开发环境覆盖或生产调试）
    if (process.env.ACTIVATION_SECRET_KEY) {
        secretConfig.activationSecretKey = process.env.ACTIVATION_SECRET_KEY;
        logger.debug('Activation secret key loaded from system environment');
    }

    if (process.env.ACTIVATION_ENCRYPTION_KEY) {
        secretConfig.encryptionKey = process.env.ACTIVATION_ENCRYPTION_KEY;
        logger.debug('Encryption key loaded from system environment');
    }

    if (process.env.ACTIVATION_ENCRYPTION_IV) {
        secretConfig.encryptionIV = process.env.ACTIVATION_ENCRYPTION_IV;
        logger.debug('Encryption IV loaded from system environment');
    }

    // 优先级3：从.env文件加载（开发环境）
    if (!secretConfig.activationSecretKey && secretConfig.nodeEnv === 'development') {
        const envVars = loadEnvFile();
        if (envVars.ACTIVATION_SECRET_KEY) {
            secretConfig.activationSecretKey = envVars.ACTIVATION_SECRET_KEY;
            logger.debug('Activation secret key loaded from .env file');
        }
        if (envVars.ACTIVATION_ENCRYPTION_KEY) {
            secretConfig.encryptionKey = envVars.ACTIVATION_ENCRYPTION_KEY;
            logger.debug('Encryption key loaded from .env file');
        }
        if (envVars.ACTIVATION_ENCRYPTION_IV) {
            secretConfig.encryptionIV = envVars.ACTIVATION_ENCRYPTION_IV;
            logger.debug('Encryption IV loaded from .env file');
        }
    }

    // 优先级4：使用默认值或生产环境强制验证
    const isProduction = secretConfig.nodeEnv === 'production';
    const isDevelopment = secretConfig.nodeEnv === 'development';

    // 在生产环境中，密钥必须由嵌入式配置或系统环境变量提供
    if (isProduction) {
        if (!secretConfig.activationSecretKey) {
            throw new Error('ACTIVATION_SECRET_KEY is required in production environment. Please ensure embedded-secrets.js exists or set the system environment variable.');
        }
        if (!secretConfig.encryptionKey) {
            throw new Error('ACTIVATION_ENCRYPTION_KEY is required in production environment. Please ensure embedded-secrets.js exists or set the system environment variable.');
        }
        if (!secretConfig.encryptionIV) {
            throw new Error('ACTIVATION_ENCRYPTION_IV is required in production environment. Please ensure embedded-secrets.js exists or set the system environment variable.');
        }
    } else if (isDevelopment) {
        // 开发环境：使用默认值便于开发（但会产生警告）
        if (!secretConfig.activationSecretKey) {
            secretConfig.activationSecretKey = 'SpecialEducationMultiModalInterventionSystem2023';
            logger.warn('Using default activation secret key in development mode. NOT SECURE for production!');
        }
        if (!secretConfig.encryptionKey) {
            secretConfig.encryptionKey = '0123456789abcdef0123456789abcdef';
            logger.warn('Using default encryption key in development mode. NOT SECURE for production!');
        }
        if (!secretConfig.encryptionIV) {
            secretConfig.encryptionIV = '0123456789abcdef';
            logger.warn('Using default encryption IV in development mode. NOT SECURE for production!');
        }
    }

    // 验证密钥格式
    validateKeys();

    logger.info('Secret manager initialized successfully');
}

/**
 * 验证密钥的有效性和格式
 */
function validateKeys() {
    // 验证激活密钥
    if (!secretConfig.activationSecretKey || secretConfig.activationSecretKey.length < 32) {
        logger.warn('ACTIVATION_SECRET_KEY is too short. Minimum 32 characters required.');
    }

    // 验证加密密钥（应为32字节的十六进制字符串或32字节的Buffer）
    if (!secretConfig.encryptionKey) {
        throw new Error('ACTIVATION_ENCRYPTION_KEY is required');
    }

    // 如果是十六进制字符串，验证长度为64个字符（32字节）
    if (typeof secretConfig.encryptionKey === 'string') {
        if (secretConfig.encryptionKey.length !== 64) {
            logger.warn(`ACTIVATION_ENCRYPTION_KEY should be 64 hex characters (32 bytes), got ${secretConfig.encryptionKey.length}`);
        }
    }

    // 验证IV（应为16字节的十六进制字符串或16字节的Buffer）
    if (!secretConfig.encryptionIV) {
        throw new Error('ACTIVATION_ENCRYPTION_IV is required');
    }

    if (typeof secretConfig.encryptionIV === 'string') {
        if (secretConfig.encryptionIV.length !== 32) {
            logger.warn(`ACTIVATION_ENCRYPTION_IV should be 32 hex characters (16 bytes), got ${secretConfig.encryptionIV.length}`);
        }
    }
}

/**
 * 获取激活系统密钥
 * 返回：密钥字符串
 */
function getActivationSecretKey() {
    if (!secretConfig.activationSecretKey) {
        throw new Error('Activation secret key is not initialized');
    }
    return secretConfig.activationSecretKey;
}

/**
 * 获取AES加密密钥
 * 返回：Buffer或十六进制字符串
 */
function getEncryptionKey() {
    if (!secretConfig.encryptionKey) {
        throw new Error('Encryption key is not initialized');
    }

    // 如果是十六进制字符串，转换为Buffer
    if (typeof secretConfig.encryptionKey === 'string') {
        return Buffer.from(secretConfig.encryptionKey, 'hex');
    }

    return secretConfig.encryptionKey;
}

/**
 * 获取AES初始化向量
 * 返回：Buffer或十六进制字符串
 */
function getEncryptionIV() {
    if (!secretConfig.encryptionIV) {
        throw new Error('Encryption IV is not initialized');
    }

    // 如果是十六进制字符串，转换为Buffer
    if (typeof secretConfig.encryptionIV === 'string') {
        return Buffer.from(secretConfig.encryptionIV, 'hex');
    }

    return secretConfig.encryptionIV;
}

/**
 * 生成随机密钥（用于初始化.env文件）
 * 返回：{ key: string, iv: string }
 */
function generateRandomKeys() {
    const encryptionKey = crypto.randomBytes(32).toString('hex');
    const encryptionIV = crypto.randomBytes(16).toString('hex');

    return {
        encryptionKey,
        encryptionIV
    };
}

/**
 * 获取当前环境配置（调试用）
 * 返回：配置对象（不包含实际密钥值）
 */
function getConfigStatus() {
    return {
        nodeEnv: secretConfig.nodeEnv,
        hasActivationSecretKey: !!secretConfig.activationSecretKey,
        hasEncryptionKey: !!secretConfig.encryptionKey,
        hasEncryptionIV: !!secretConfig.encryptionIV,
        activationSecretKeyLength: secretConfig.activationSecretKey?.length || 0,
        encryptionKeyLength: secretConfig.encryptionKey?.length || 0,
        encryptionIVLength: secretConfig.encryptionIV?.length || 0
    };
}

module.exports = {
    initialize,
    getActivationSecretKey,
    getEncryptionKey,
    getEncryptionIV,
    generateRandomKeys,
    getConfigStatus
};
