/**
 * Logo 处理模块
 * 处理 Logo 上传、验证、保存和管理
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const config = require('../config');
const { getLogger } = require('../logger');

const logger = getLogger('LOGO_HANDLER');

/**
 * Logo 配置
 */
const LOGO_CONFIG = {
    // 支持的图片格式
    supportedFormats: ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.bmp'],
    // 最大文件大小 (2MB)
    maxFileSize: 2 * 1024 * 1024,
    // 推荐尺寸
    recommendedSize: {
        width: 512,
        height: 512
    },
    // 最小尺寸
    minSize: {
        width: 64,
        height: 64
    },
    // 缩略图尺寸
    thumbnailSize: {
        width: 128,
        height: 128
    },
    // Logo 存储目录
    logoDirName: 'logos',
    customLogoDirName: 'custom',
    systemLogoDirName: 'system',
    thumbnailsDirName: 'thumbnails'
};

/**
 * 获取 Logo 目录路径
 */
function getLogosPath() {
    let logosPath;
    if (process.platform === 'win32') {
        logosPath = path.join(
            app.getPath('appData'),
            config.activationConfig.appDataDirName,
            LOGO_CONFIG.logoDirName
        );
    } else {
        logosPath = path.join(
            app.getPath('home'),
            'Library',
            'Application Support',
            config.activationConfig.appDataDirName,
            LOGO_CONFIG.logoDirName
        );
    }
    return logosPath;
}

/**
 * 获取自定义 Logo 目录路径
 */
function getCustomLogosPath() {
    return path.join(getLogosPath(), LOGO_CONFIG.customLogoDirName);
}

/**
 * 获取系统 Logo 目录路径
 */
function getSystemLogosPath() {
    return path.join(getLogosPath(), LOGO_CONFIG.systemLogoDirName);
}

/**
 * 获取缩略图目录路径
 */
function getThumbnailsPath() {
    return path.join(getCustomLogosPath(), LOGO_CONFIG.thumbnailsDirName);
}

/**
 * 确保 Logo 目录存在
 */
function ensureLogoDirsExist() {
    try {
        const dirs = [
            getLogosPath(),
            getCustomLogosPath(),
            getSystemLogosPath(),
            getThumbnailsPath()
        ];

        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        logger.debug('Logo directories ensured');
    } catch (error) {
        logger.error('Failed to ensure logo directories', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 验证文件是否是有效的图片文件
 */
function validateImageFile(filePath) {
    try {
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            throw new Error('File does not exist');
        }

        // 检查文件扩展名
        const ext = path.extname(filePath).toLowerCase();
        if (!LOGO_CONFIG.supportedFormats.includes(ext)) {
            throw new Error(`Unsupported format: ${ext}. Supported formats: ${LOGO_CONFIG.supportedFormats.join(', ')}`);
        }

        // 检查文件大小
        const stat = fs.statSync(filePath);
        if (stat.size > LOGO_CONFIG.maxFileSize) {
            throw new Error(`File size ${stat.size} exceeds maximum ${LOGO_CONFIG.maxFileSize}`);
        }

        return true;
    } catch (error) {
        logger.warn('Image file validation failed', {
            file: filePath,
            error: error.message
        });
        throw error;
    }
}

/**
 * 生成唯一的文件名
 */
function generateUniqueFileName(originalFileName) {
    const ext = path.extname(originalFileName);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `logo-${timestamp}-${random}${ext}`;
}

/**
 * 保存 Logo 文件
 */
function saveLogo(sourceFilePath, fileName = null) {
    try {
        // 验证源文件
        validateImageFile(sourceFilePath);

        // 确保目录存在
        ensureLogoDirsExist();

        // 生成目标文件名
        const targetFileName = fileName || generateUniqueFileName(path.basename(sourceFilePath));
        const targetPath = path.join(getCustomLogosPath(), targetFileName);

        // 复制文件
        fs.copyFileSync(sourceFilePath, targetPath);

        logger.info('Logo saved successfully', {
            source: sourceFilePath,
            target: targetPath,
            fileName: targetFileName
        });

        return {
            fileName: targetFileName,
            filePath: targetPath,
            url: `/logos/custom/${targetFileName}`
        };
    } catch (error) {
        logger.error('Failed to save logo', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 删除 Logo 文件
 */
function deleteLogo(fileName) {
    try {
        const filePath = path.join(getCustomLogosPath(), fileName);

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            throw new Error('Logo file not found');
        }

        // 删除缩略图（如果存在）
        const thumbPath = path.join(getThumbnailsPath(), `thumb-${fileName}`);
        if (fs.existsSync(thumbPath)) {
            fs.unlinkSync(thumbPath);
        }

        // 删除主文件
        fs.unlinkSync(filePath);

        logger.info('Logo deleted successfully', {
            fileName: fileName
        });

        return true;
    } catch (error) {
        logger.error('Failed to delete logo', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 获取所有自定义 Logo 列表
 */
function getLogosList() {
    try {
        const customLogosPath = getCustomLogosPath();

        // 如果目录不存在，返回空列表
        if (!fs.existsSync(customLogosPath)) {
            return [];
        }

        const files = fs.readdirSync(customLogosPath);
        const logoFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return LOGO_CONFIG.supportedFormats.includes(ext);
        });

        return logoFiles.map(fileName => {
            const filePath = path.join(customLogosPath, fileName);
            const stat = fs.statSync(filePath);

            return {
                fileName: fileName,
                filePath: filePath,
                url: `/logos/custom/${fileName}`,
                size: stat.size,
                createdAt: stat.birthtime,
                modifiedAt: stat.mtime
            };
        });
    } catch (error) {
        logger.error('Failed to get logos list', {
            error: error.message
        });
        return [];
    }
}

/**
 * 获取系统默认 Logo
 */
function getSystemLogos() {
    try {
        const systemLogosPath = getSystemLogosPath();

        // 如果目录不存在，返回空列表
        if (!fs.existsSync(systemLogosPath)) {
            return [];
        }

        const files = fs.readdirSync(systemLogosPath);
        const logoFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return LOGO_CONFIG.supportedFormats.includes(ext);
        });

        return logoFiles.map(fileName => ({
            fileName: fileName,
            url: `/logos/system/${fileName}`,
            isSystem: true
        }));
    } catch (error) {
        logger.error('Failed to get system logos', {
            error: error.message
        });
        return [];
    }
}

/**
 * 获取 Logo 文件内容 (Buffer)
 */
function getLogoBuffer(fileName, isSystem = false) {
    try {
        const logosPath = isSystem ? getSystemLogosPath() : getCustomLogosPath();
        const filePath = path.join(logosPath, fileName);

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            throw new Error('Logo file not found');
        }

        return fs.readFileSync(filePath);
    } catch (error) {
        logger.error('Failed to get logo buffer', {
            error: error.message
        });
        throw error;
    }
}

/**
 * 初始化 Logo 处理模块
 */
function initialize() {
    try {
        ensureLogoDirsExist();
        logger.info('Logo handler initialized');
    } catch (error) {
        logger.error('Failed to initialize logo handler', {
            error: error.message
        });
    }
}

module.exports = {
    getLogosPath,
    getCustomLogosPath,
    getSystemLogosPath,
    getThumbnailsPath,
    ensureLogoDirsExist,
    validateImageFile,
    generateUniqueFileName,
    saveLogo,
    deleteLogo,
    getLogosList,
    getSystemLogos,
    getLogoBuffer,
    initialize,
    LOGO_CONFIG
};
