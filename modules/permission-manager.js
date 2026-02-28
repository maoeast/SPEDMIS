/**
 * 权限管理模块
 * 实现管理员密码验证和权限控制
 * 限制用户对Logo设置和产品名称修改功能的访问
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { getLogger } = require('../logger');

const logger = getLogger('PERMISSION_MANAGER');

/**
 * 获取权限配置存储路径
 */
function getPermissionConfigPath() {
    let storagePath;
    if (process.platform === 'win32') {
        storagePath = path.join(
            app.getPath('appData'),
            '特殊教育多模态干预系统',
            'config',
            'permissions.json'
        );
    } else {
        storagePath = path.join(
            app.getPath('home'),
            'Library',
            'Application Support',
            '特殊教育多模态干预系统',
            'config',
            'permissions.json'
        );
    }
    return storagePath;
}

/**
 * 默认管理员密码（应该在实际应用中通过其他方式设置）
 */
const DEFAULT_ADMIN_PASSWORD = '299451';

/**
 * 加密密码
 */
function hashPassword(password) {
    return crypto
        .createHash('sha256')
        .update(password)
        .digest('hex');
}

/**
 * 验证密码
 */
function verifyPassword(inputPassword, storedHash) {
    const inputHash = hashPassword(inputPassword);
    return inputHash === storedHash;
}

/**
 * 初始化权限配置
 */
async function initializePermissions() {
    try {
        const configPath = getPermissionConfigPath();
        const configDir = path.dirname(configPath);

        // 确保目录存在
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        // 如果配置文件不存在，创建默认配置
        if (!fs.existsSync(configPath)) {
            const defaultConfig = {
                adminPasswordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
                permissions: {
                    setProductName: { requiresAuth: true, description: '修改产品名称' },
                    uploadLogo: { requiresAuth: true, description: '上传Logo' },
                    deleteLogo: { requiresAuth: true, description: '删除Logo' },
                    setDefaultLogo: { requiresAuth: true, description: '设置默认Logo' },
                    getUsageStats: { requiresAuth: false, description: '查看使用统计' },
                },
                sessionTokens: {}, // 存储当前授权的会话
                lastUpdated: new Date().toISOString(),
            };

            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
            logger.info('Permission configuration initialized', { path: configPath });
        }

        return true;
    } catch (error) {
        logger.error('Failed to initialize permissions', { error: error.message });
        throw error;
    }
}

/**
 * 获取权限配置
 */
function getPermissionConfig() {
    try {
        const configPath = getPermissionConfigPath();
        if (!fs.existsSync(configPath)) {
            return null;
        }
        const data = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error('Failed to read permission config', { error: error.message });
        return null;
    }
}

/**
 * 保存权限配置
 */
function savePermissionConfig(config) {
    try {
        const configPath = getPermissionConfigPath();
        const configDir = path.dirname(configPath);

        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        config.lastUpdated = new Date().toISOString();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        logger.error('Failed to save permission config', { error: error.message });
        throw error;
    }
}

/**
 * 验证管理员密码
 * 返回：{ success: boolean, token?: string, message: string }
 */
function verifyAdminPassword(password) {
    try {
        logger.info('Admin password verification attempt');
        const config = getPermissionConfig();

        if (!config) {
            logger.error('Permission config not found - initializing...');
            // 如果配置不存在，尝试初始化（同步版本）
            const configPath = getPermissionConfigPath();
            const configDir = path.dirname(configPath);

            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            // 创建默认配置
            const defaultConfig = {
                adminPasswordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
                permissions: {
                    setProductName: { requiresAuth: true, description: '修改产品名称' },
                    uploadLogo: { requiresAuth: true, description: '上传Logo' },
                    deleteLogo: { requiresAuth: true, description: '删除Logo' },
                    setDefaultLogo: { requiresAuth: true, description: '设置默认Logo' },
                    getUsageStats: { requiresAuth: false, description: '查看使用统计' },
                },
                sessionTokens: {},
                lastUpdated: new Date().toISOString(),
            };

            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
            logger.info('Permission configuration created during password verification');

            // 验证新创建的配置
            const inputHash = hashPassword(password);
            if (inputHash === defaultConfig.adminPasswordHash) {
                logger.info('Password verified against newly created config');
                const token = crypto.randomBytes(32).toString('hex');
                const timestamp = Date.now();
                defaultConfig.sessionTokens[token] = {
                    createdAt: timestamp,
                    expiresAt: timestamp + 3600000,
                };
                fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
                return {
                    success: true,
                    token,
                    message: '密码验证成功',
                };
            } else {
                logger.warn('Password verification failed against new config');
                return {
                    success: false,
                    message: '密码错误，请重试',
                };
            }
        }

        logger.debug('Config found, verifying password');
        const inputHash = hashPassword(password);
        const storedHash = config.adminPasswordHash;

        logger.debug('Password hash comparison', {
            inputHashStart: inputHash.substring(0, 8),
            storedHashStart: storedHash.substring(0, 8),
            match: inputHash === storedHash
        });

        if (verifyPassword(password, config.adminPasswordHash)) {
            // 生成会话令牌
            const token = crypto.randomBytes(32).toString('hex');
            const timestamp = Date.now();

            // 存储令牌（有效期1小时）
            config.sessionTokens[token] = {
                createdAt: timestamp,
                expiresAt: timestamp + 3600000, // 1小时后过期
            };

            savePermissionConfig(config);

            logger.info('Admin password verified successfully');
            return {
                success: true,
                token,
                message: '密码验证成功',
            };
        } else {
            logger.warn('Admin password verification failed - password mismatch');
            return {
                success: false,
                message: '密码错误，请重试',
            };
        }
    } catch (error) {
        logger.error('Failed to verify admin password', { error: error.message });
        return {
            success: false,
            message: '密码验证失败：' + error.message,
        };
    }
}

/**
 * 验证会话令牌
 */
function verifySessionToken(token) {
    try {
        const config = getPermissionConfig();
        if (!config || !config.sessionTokens[token]) {
            return false;
        }

        const tokenData = config.sessionTokens[token];
        const now = Date.now();

        // 检查令牌是否过期
        if (tokenData.expiresAt < now) {
            // 删除过期令牌
            delete config.sessionTokens[token];
            savePermissionConfig(config);
            return false;
        }

        return true;
    } catch (error) {
        logger.error('Failed to verify session token', { error: error.message });
        return false;
    }
}

/**
 * 检查权限
 * @param {string} action - 操作名称
 * @param {string} token - 会话令牌（可选）
 */
function checkPermission(action, token = null) {
    try {
        const config = getPermissionConfig();
        if (!config) {
            return {
                allowed: false,
                message: '权限配置不存在',
            };
        }

        const permission = config.permissions[action];
        if (!permission) {
            return {
                allowed: true,
                message: '无权限限制',
            };
        }

        // 如果不需要认证
        if (!permission.requiresAuth) {
            return {
                allowed: true,
                message: '不需要认证',
            };
        }

        // 如果需要认证，检查token
        if (!token || !verifySessionToken(token)) {
            return {
                allowed: false,
                message: '需要管理员认证',
                requiresAuth: true,
            };
        }

        return {
            allowed: true,
            message: '权限验证通过',
        };
    } catch (error) {
        logger.error('Failed to check permission', {
            action,
            error: error.message,
        });
        return {
            allowed: false,
            message: '权限检查失败：' + error.message,
        };
    }
}

/**
 * 注销会话
 */
function revokeSession(token) {
    try {
        const config = getPermissionConfig();
        if (config && config.sessionTokens[token]) {
            delete config.sessionTokens[token];
            savePermissionConfig(config);
            logger.info('Session revoked', { token: token.substring(0, 8) + '...' });
            return true;
        }
        return false;
    } catch (error) {
        logger.error('Failed to revoke session', { error: error.message });
        return false;
    }
}

/**
 * 更新管理员密码
 */
function updateAdminPassword(oldPassword, newPassword) {
    try {
        const config = getPermissionConfig();
        if (!config) {
            return {
                success: false,
                message: '权限配置不存在',
            };
        }

        // 验证旧密码
        if (!verifyPassword(oldPassword, config.adminPasswordHash)) {
            logger.warn('Old password verification failed when updating admin password');
            return {
                success: false,
                message: '旧密码错误',
            };
        }

        // 更新密码
        config.adminPasswordHash = hashPassword(newPassword);
        config.sessionTokens = {}; // 清空所有会话
        savePermissionConfig(config);

        logger.info('Admin password updated successfully');
        return {
            success: true,
            message: '密码更新成功，请重新登录',
        };
    } catch (error) {
        logger.error('Failed to update admin password', { error: error.message });
        return {
            success: false,
            message: '密码更新失败：' + error.message,
        };
    }
}

/**
 * 清空所有会话
 */
function clearAllSessions() {
    try {
        const config = getPermissionConfig();
        if (config) {
            config.sessionTokens = {};
            savePermissionConfig(config);
            logger.info('All sessions cleared');
        }
    } catch (error) {
        logger.error('Failed to clear sessions', { error: error.message });
    }
}

module.exports = {
    initializePermissions,
    getPermissionConfig,
    savePermissionConfig,
    verifyAdminPassword,
    verifySessionToken,
    checkPermission,
    revokeSession,
    updateAdminPassword,
    clearAllSessions,
    getPermissionConfigPath,
};
