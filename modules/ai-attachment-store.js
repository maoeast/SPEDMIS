'use strict';

// 图片附件受控存储（Phase 3b）。全 rigor 校验（扩展名 + MIME + 魔数 + 尺寸 + 大小），
// sha256 去重/完整性，受控目录写入，base64 数据 URL 重建（Main 内，渲染层沙箱不能
// 读文件），孤儿文件清理。比 SIC-ADS 源实现更严（源无魔数/尺寸/哈希/生命周期）。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IMAGE_EXTENSIONS = Object.freeze(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
const MIME_BY_EXT = Object.freeze({
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
});
const MAGIC_BYTES = Object.freeze({
    jpg: [0xFF, 0xD8, 0xFF],
    jpeg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    gif: [0x47, 0x49, 0x46, 0x38], // GIF8
    bmp: [0x42, 0x4D], // BM
});

const MAX_PER_IMAGE_BYTES = 5 * 1024 * 1024;
const WARN_PER_IMAGE_BYTES = 1 * 1024 * 1024;
const MAX_TOTAL_COUNT = 4;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_DIMENSION = 4096;

function getFileExtension(fileName) {
    const match = /\.([^.]+)$/.exec(String(fileName || ''));
    return match ? match[1].toLowerCase() : '';
}

function normalizeExt(ext) {
    return ext === 'jpeg' ? 'jpg' : ext;
}

function bytesMatch(buffer, expected) {
    if (buffer.length < expected.length) {
        return false;
    }
    for (let index = 0; index < expected.length; index += 1) {
        if (buffer[index] !== expected[index]) {
            return false;
        }
    }
    return true;
}

function detectMagicType(buffer) {
    if (!Buffer.isBuffer(buffer)) {
        return null;
    }
    if (bytesMatch(buffer, MAGIC_BYTES.png)) return 'png';
    if (bytesMatch(buffer, MAGIC_BYTES.jpg)) return 'jpg';
    if (bytesMatch(buffer, MAGIC_BYTES.gif)) return 'gif';
    if (bytesMatch(buffer, MAGIC_BYTES.bmp)) return 'bmp';
    if (buffer.length >= 12
        && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
        && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'webp';
    }
    return null;
}

function parseImageDimensions(buffer, ext) {
    const normalized = normalizeExt(ext);
    try {
        if (normalized === 'png' && buffer.length >= 24) {
            return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
        }
        if (normalized === 'gif' && buffer.length >= 10) {
            return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
        }
        if (normalized === 'bmp' && buffer.length >= 26) {
            return { width: buffer.readUInt32LE(18), height: buffer.readUInt32LE(22) };
        }
        if (normalized === 'webp' && buffer.length >= 30) {
            const fourcc = buffer.toString('ascii', 12, 16);
            if (fourcc === 'VP8X') {
                return {
                    width: ((buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1),
                    height: ((buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1),
                };
            }
            if (fourcc === 'VP8 ' && buffer.length >= 30) {
                return { width: buffer.readUInt16LE(26) & 0x3FFF, height: buffer.readUInt16LE(28) & 0x3FFF };
            }
        }
        if (normalized === 'jpg' && buffer.length >= 4) {
            let offset = 2;
            while (offset + 9 <= buffer.length) {
                if (buffer[offset] !== 0xFF) {
                    break;
                }
                const marker = buffer[offset + 1];
                if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) {
                    offset += 2;
                    continue;
                }
                const isSof = marker >= 0xC0 && marker <= 0xCF
                    && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
                if (isSof) {
                    return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
                }
                const segLen = buffer.readUInt16BE(offset + 2);
                if (segLen < 2) {
                    break;
                }
                offset += 2 + segLen;
            }
        }
    } catch {
        // 解析失败 → 返回未知尺寸（由调用方决定是否拒绝）。
    }
    return { width: null, height: null };
}

function validateImageFile({ buffer, fileName }) {
    const ext = getFileExtension(fileName);
    const errors = [];
    if (!IMAGE_EXTENSIONS.includes(ext)) {
        return { ok: false, errors: ['不支持的图片格式（仅 jpg/jpeg/png/gif/webp/bmp）。'], extension: ext, mimeType: null, width: null, height: null };
    }
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return { ok: false, errors: ['图片内容为空。'], extension: ext, mimeType: null, width: null, height: null };
    }
    if (buffer.length > MAX_PER_IMAGE_BYTES) {
        errors.push(`单张图片超过 ${MAX_PER_IMAGE_BYTES / 1024 / 1024}MB。`);
    }
    const magicExt = detectMagicType(buffer);
    if (!magicExt || normalizeExt(magicExt) !== normalizeExt(ext)) {
        errors.push('文件内容与扩展名不符（魔数校验失败）。');
    }
    const { width, height } = parseImageDimensions(buffer, ext);
    if ((width != null && width > MAX_DIMENSION) || (height != null && height > MAX_DIMENSION)) {
        errors.push(`图片尺寸超过 ${MAX_DIMENSION}px。`);
    }
    return {
        ok: errors.length === 0,
        errors,
        extension: ext,
        mimeType: MIME_BY_EXT[ext],
        width,
        height,
    };
}

function sanitizeFileName(name) {
    return String(name || '').replace(/[<>:"/\\|?*]/g, '_');
}

function buildRelativePath(conversationId, fileName) {
    return `${conversationId}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

async function saveAttachmentFile({ attachmentDir, relativePath, buffer }) {
    const absPath = path.join(attachmentDir, relativePath);
    await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
    await fs.promises.writeFile(absPath, buffer);
    return absPath;
}

function computeSha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function readAsDataUrl(attachmentDir, relativePath, mimeType) {
    const absPath = path.join(attachmentDir, relativePath);
    const buffer = await fs.promises.readFile(absPath);
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function deleteAttachmentFile(attachmentDir, relativePath) {
    const absPath = path.join(attachmentDir, relativePath);
    try {
        await fs.promises.unlink(absPath);
    } catch (error) {
        if (error && error.code !== 'ENOENT') {
            throw error;
        }
    }
}

async function cleanupOrphanedAttachments({ attachmentDir, paths }) {
    let removed = 0;
    for (const item of Array.isArray(paths) ? paths : []) {
        try {
            await deleteAttachmentFile(attachmentDir, item.relativePath);
            removed += 1;
        } catch {
            // best-effort：单个文件失败不阻断其余清理。
        }
    }
    return removed;
}

module.exports = {
    IMAGE_EXTENSIONS,
    MIME_BY_EXT,
    MAX_PER_IMAGE_BYTES,
    WARN_PER_IMAGE_BYTES,
    MAX_TOTAL_COUNT,
    MAX_TOTAL_BYTES,
    MAX_DIMENSION,
    getFileExtension,
    detectMagicType,
    parseImageDimensions,
    validateImageFile,
    sanitizeFileName,
    buildRelativePath,
    saveAttachmentFile,
    computeSha256,
    readAsDataUrl,
    deleteAttachmentFile,
    cleanupOrphanedAttachments,
};
