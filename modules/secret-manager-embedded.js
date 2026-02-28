/**
 * 嵌入式密钥管理器
 * 
 * 在打包生产环境时使用此文件替代标准的密钥管理器
 * 所有密钥已在构建时嵌入，用户无需配置环境变量
 */

const embeddedSecrets = require('../embedded-secrets');
const crypto = require('crypto');
const { getLogger } = require('../logger');

const logger = getLogger('SECRET_MANAGER');

let secretConfig = {
    activationSecretKey: embeddedSecrets.activationSecretKey,
    encryptionKey: embeddedSecrets.encryptionKey,
    encryptionIV: embeddedSecrets.encryptionIV,
    nodeEnv: process.env.NODE_ENV || 'production'
};

function initialize() {
    logger.info('Secret manager initialized with embedded secrets', {
        env: secretConfig.nodeEnv,
        generatedAt: embeddedSecrets.generatedAt
    });
}

function getActivationSecretKey() {
    if (!secretConfig.activationSecretKey) {
        throw new Error('Activation secret key is not initialized');
    }
    return secretConfig.activationSecretKey;
}

function getEncryptionKey() {
    if (!secretConfig.encryptionKey) {
        throw new Error('Encryption key is not initialized');
    }
    if (typeof secretConfig.encryptionKey === 'string') {
        return Buffer.from(secretConfig.encryptionKey, 'hex');
    }
    return secretConfig.encryptionKey;
}

function getEncryptionIV() {
    if (!secretConfig.encryptionIV) {
        throw new Error('Encryption IV is not initialized');
    }
    if (typeof secretConfig.encryptionIV === 'string') {
        return Buffer.from(secretConfig.encryptionIV, 'hex');
    }
    return secretConfig.encryptionIV;
}

function getConfigStatus() {
    return {
        nodeEnv: secretConfig.nodeEnv,
        hasActivationSecretKey: !!secretConfig.activationSecretKey,
        hasEncryptionKey: !!secretConfig.encryptionKey,
        hasEncryptionIV: !!secretConfig.encryptionIV,
        embedded: true,
        generatedAt: embeddedSecrets.generatedAt
    };
}

module.exports = {
    initialize,
    getActivationSecretKey,
    getEncryptionKey,
    getEncryptionIV,
    getConfigStatus
};
