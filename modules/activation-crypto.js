/**
 * 激活信息加密模块
 * 
 * 使用AES-256-GCM算法对激活信息进行加密和解密
 * 
 * 为什么使用AES-256-GCM？
 * 1. AES-256：军事级加密算法，256位密钥提供极高的安全性
 * 2. GCM模式：提供数据完整性验证（检测篡改）
 * 3. 认证加密：既保证保密性也保证真实性
 * 
 * 数据结构：
 * 加密数据 = IV(16字节) + authTag(16字节) + cipherText(变长)
 * 总长度 = 32字节 + 加密文本长度
 */

const crypto = require('crypto');
const { getLogger } = require('../logger');
const secretManager = require('./secret-manager');

const logger = getLogger('ACTIVATION_CRYPTO');

// AES-256-GCM 配置
const ALGORITHM = 'aes-256-gcm';
const AUTH_TAG_LENGTH = 16;  // 16字节 = 128位
const IV_LENGTH = 16;         // 16字节 = 128位

/**
 * 加密激活信息
 * 
 * @param {Object} data - 要加密的数据对象
 * @returns {string} 加密后的十六进制字符串
 */
function encryptActivationData(data) {
    try {
        // 验证输入
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid data: must be an object');
        }

        // 获取加密密钥
        const key = secretManager.getEncryptionKey();

        // 生成随机IV（每次加密都使用新的IV）
        const iv = crypto.randomBytes(IV_LENGTH);

        // 将数据转换为JSON字符串
        const plaintext = JSON.stringify(data);

        // 创建加密对象
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        // 加密数据
        let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
        ciphertext += cipher.final('hex');

        // 获取认证标签
        const authTag = cipher.getAuthTag();

        // 组合数据：IV + authTag + ciphertext
        // IV和authTag使用二进制格式，便于长度固定和解析
        const encryptedBuffer = Buffer.concat([iv, authTag, Buffer.from(ciphertext, 'hex')]);

        // 转换为base64（便于在JSON中存储）
        const encrypted = encryptedBuffer.toString('base64');

        logger.debug('Activation data encrypted successfully', {
            originalSize: plaintext.length,
            encryptedSize: encrypted.length
        });

        return encrypted;
    } catch (error) {
        logger.error('Failed to encrypt activation data', { error: error.message });
        throw error;
    }
}

/**
 * 解密激活信息
 * 
 * @param {string} encrypted - 加密后的十六进制字符串
 * @returns {Object} 解密后的数据对象
 */
function decryptActivationData(encrypted) {
    try {
        // 验证输入
        if (!encrypted || typeof encrypted !== 'string') {
            throw new Error('Invalid encrypted data: must be a string');
        }

        // 获取加密密钥
        const key = secretManager.getEncryptionKey();

        // 从base64解码为Buffer
        const encryptedBuffer = Buffer.from(encrypted, 'base64');

        // 验证长度（至少32字节：16字节IV + 16字节authTag）
        if (encryptedBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
            throw new Error('Invalid encrypted data: buffer too short');
        }

        // 提取IV
        const iv = encryptedBuffer.slice(0, IV_LENGTH);

        // 提取认证标签
        const authTag = encryptedBuffer.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);

        // 提取密文
        const ciphertext = encryptedBuffer.slice(IV_LENGTH + AUTH_TAG_LENGTH);

        // 创建解密对象
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

        // 设置认证标签（用于验证数据完整性）
        decipher.setAuthTag(authTag);

        // 解密数据
        let plaintext = decipher.update(ciphertext);
        plaintext = Buffer.concat([plaintext, decipher.final()]);

        // 将Buffer转换为字符串，然后解析为JSON
        const decrypted = plaintext.toString('utf8');
        const data = JSON.parse(decrypted);

        logger.debug('Activation data decrypted successfully', {
            decryptedSize: decrypted.length
        });

        return data;
    } catch (error) {
        logger.error('Failed to decrypt activation data', {
            error: error.message,
            errorCode: error.code
        });
        throw error;
    }
}

/**
 * 验证加密数据的完整性
 * 
 * 注意：解密时会自动验证，此函数用于提前检查
 * 
 * @param {string} encrypted - 加密的数据
 * @returns {boolean} true表示数据完整，false表示被篡改
 */
function verifyDataIntegrity(encrypted) {
    try {
        decryptActivationData(encrypted);
        return true;
    } catch (error) {
        // 如果是认证标签验证失败的错误
        if (error.code === 'ERR_OSSL_EVP_BAD_DECRYPT' || error.message.includes('Unsupported')) {
            logger.warn('Encryption data integrity check failed - data may have been tampered');
            return false;
        }
        // 其他错误也返回false
        return false;
    }
}

module.exports = {
    encryptActivationData,
    decryptActivationData,
    verifyDataIntegrity
};
