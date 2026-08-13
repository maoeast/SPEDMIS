/**
 * 激活文件（.lis）格式模块
 *
 * 统一 SPEDMIS 激活文件的构建与解析，供以下两侧共用（单一实现）：
 * - 激活码生成工具（tools/activation-tool-cli.js / 单文件 activation-tool-gui.html）导出 .lis 文件
 * - 激活页面（activation.html → main.js IPC）导入 .lis 文件自动激活
 *
 * 文件格式（文本，UTF-8）：
 *   # SPEDMIS Activation File v1
 *   machineCode=<64位十六进制>
 *   activationCode=<64位十六进制>
 *   issuedAt=<ISO 8601 时间戳>
 *
 * 解析容错：BOM、CRLF/LF、空行、# 注释行、key 大小写不敏感、字段顺序无关。
 */

const { getLogger } = require('../logger');

const logger = getLogger('ACTIVATION_LIS');

const LIS_FORMAT_VERSION = 'v1';
const LIS_HEADER = `# SPEDMIS Activation File ${LIS_FORMAT_VERSION}`;
const HEX_64 = /^[a-fA-F0-9]{64}$/;

/**
 * 校验机器码 / 激活码格式（64 位十六进制）
 * @param {string} value
 * @param {string} fieldName - 字段名（用于错误信息）
 * @returns {boolean}
 */
function isValidHex64(value, fieldName) {
    if (typeof value !== 'string' || !HEX_64.test(value.trim())) {
        logger.warn(`Invalid ${fieldName} format for lis file`);
        return false;
    }
    return true;
}

/**
 * 构建激活文件内容
 *
 * @param {string} machineCode - 64 位十六进制机器码
 * @param {string} activationCode - 64 位十六进制激活码
 * @param {Object} [options]
 * @param {string} [options.issuedAt] - 签发时间（ISO 8601），默认当前时间
 * @returns {string} .lis 文件文本内容
 * @throws {Error} 机器码或激活码格式非法时抛错
 */
function buildLisContent(machineCode, activationCode, options = {}) {
    if (!isValidHex64(machineCode, 'machineCode')) {
        throw new Error('机器码格式不正确，应为 64 位十六进制字符');
    }
    if (!isValidHex64(activationCode, 'activationCode')) {
        throw new Error('激活码格式不正确，应为 64 位十六进制字符');
    }

    const issuedAt = options.issuedAt || new Date().toISOString();
    const lines = [
        LIS_HEADER,
        `machineCode=${machineCode.trim()}`,
        `activationCode=${activationCode.trim()}`,
        `issuedAt=${issuedAt}`,
    ];

    return lines.join('\n') + '\n';
}

/**
 * 解析激活文件内容
 *
 * @param {string} text - .lis 文件文本内容
 * @returns {{ machineCode: string, activationCode: string, issuedAt?: string }}
 * @throws {Error} 内容为空、缺少必需字段或字段格式非法时抛错（中文错误信息，可直接展示给用户）
 */
function parseLisContent(text) {
    if (!text || typeof text !== 'string') {
        throw new Error('激活文件内容为空');
    }

    // 去除 BOM，统一换行
    const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const fields = {};

    for (const rawLine of normalized.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }

        const eqIndex = line.indexOf('=');
        if (eqIndex <= 0) {
            continue;
        }

        const key = line.slice(0, eqIndex).trim().toLowerCase();
        const value = line.slice(eqIndex + 1).trim();

        if (key === 'machinecode' || key === 'activationcode' || key === 'issuedat') {
            fields[key] = value;
        }
    }

    if (!fields.machinecode) {
        throw new Error('激活文件中缺少机器码字段（machineCode）');
    }
    if (!fields.activationcode) {
        throw new Error('激活文件中缺少激活码字段（activationCode）');
    }
    if (!isValidHex64(fields.machinecode, 'machineCode')) {
        throw new Error('激活文件中的机器码格式不正确，应为 64 位十六进制字符');
    }
    if (!isValidHex64(fields.activationcode, 'activationCode')) {
        throw new Error('激活文件中的激活码格式不正确，应为 64 位十六进制字符');
    }

    logger.debug('Lis file parsed successfully', {
        hasIssuedAt: !!fields.issuedat,
    });

    return {
        machineCode: fields.machinecode.toLowerCase(),
        activationCode: fields.activationcode.toLowerCase(),
        ...(fields.issuedat ? { issuedAt: fields.issuedat } : {}),
    };
}

/**
 * 生成默认 .lis 文件名
 * 规则：SPEDMIS-<机器码前8位>.lis
 *
 * @param {string} machineCode - 64 位十六进制机器码
 * @returns {string} 文件名（不含路径）
 */
function buildLisFileName(machineCode) {
    const prefix = (typeof machineCode === 'string' && machineCode.length >= 8)
        ? machineCode.slice(0, 8)
        : 'ACTIVATION';
    return `SPEDMIS-${prefix}.lis`;
}

module.exports = {
    LIS_FORMAT_VERSION,
    LIS_HEADER,
    buildLisContent,
    parseLisContent,
    buildLisFileName,
};
