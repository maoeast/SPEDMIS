const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../modules/ai-attachment-store');

function makePng(width, height) {
    const buf = Buffer.alloc(24);
    const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    sig.forEach((b, i) => { buf[i] = b; });
    buf.writeUInt32BE(13, 8);
    buf.write('IHDR', 12, 4, 'ascii');
    buf.writeUInt32BE(width, 16);
    buf.writeUInt32BE(height, 20);
    return buf;
}

function makeGif(width, height) {
    const buf = Buffer.alloc(10);
    buf.write('GIF89a', 0, 6, 'ascii');
    buf.writeUInt16LE(width, 6);
    buf.writeUInt16LE(height, 8);
    return buf;
}

function makeBmp(width, height) {
    const buf = Buffer.alloc(26, 0);
    buf[0] = 0x42; buf[1] = 0x4D; // BM
    buf.writeUInt32LE(width, 18);
    buf.writeUInt32LE(height, 22);
    return buf;
}

describe('ai-attachment-store validation', () => {
    test('parses dimensions for synthetic PNG / GIF / BMP', () => {
        expect(store.parseImageDimensions(makePng(320, 240), 'png')).toEqual({ width: 320, height: 240 });
        expect(store.parseImageDimensions(makeGif(100, 200), 'gif')).toEqual({ width: 100, height: 200 });
        expect(store.parseImageDimensions(makeBmp(400, 300), 'bmp')).toEqual({ width: 400, height: 300 });
    });

    test('accepts a valid PNG and reports mime + dimensions', () => {
        const result = store.validateImageFile({ buffer: makePng(100, 200), fileName: 'a.png' });
        expect(result.ok).toBe(true);
        expect(result.mimeType).toBe('image/png');
        expect(result).toMatchObject({ width: 100, height: 200 });
    });

    test('rejects an unsupported extension', () => {
        const result = store.validateImageFile({ buffer: makePng(10, 10), fileName: 'a.tiff' });
        expect(result.ok).toBe(false);
    });

    test('rejects a magic-number mismatch (text renamed to png)', () => {
        const result = store.validateImageFile({ buffer: Buffer.from('not an image'), fileName: 'a.png' });
        expect(result.ok).toBe(false);
        expect(result.errors.join('')).toMatch(/魔数|内容与扩展名/);
    });

    test('rejects an oversize image', () => {
        const buf = makePng(10, 10);
        const oversized = Buffer.alloc(store.MAX_PER_IMAGE_BYTES + 1, 0);
        oversized.set(buf.slice(0, 8), 0); // valid PNG sig so magic check passes
        const result = store.validateImageFile({ buffer: oversized, fileName: 'big.png' });
        expect(result.ok).toBe(false);
    });
});

describe('ai-attachment-store file operations', () => {
    let tempDir;
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spedmis-att-store-'));
    });
    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('hashes, saves, reads back, and deletes attachments under the controlled dir', async () => {
        const buffer = makePng(64, 64);
        const sha = store.computeSha256(buffer);
        expect(sha).toHaveLength(64);
        expect(store.computeSha256(buffer)).toBe(sha);

        const rel = store.buildRelativePath('conv-1', 'risk/y/name.png');
        expect(rel.startsWith('conv-1/')).toBe(true);
        expect(rel).not.toContain('risk/y'); // 文件名已清洗

        await store.saveAttachmentFile({ attachmentDir: tempDir, relativePath: rel, buffer });
        const dataUrl = await store.readAsDataUrl(tempDir, rel, 'image/png');
        expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
        const roundTrip = Buffer.from(dataUrl.split(',')[1], 'base64');
        expect(roundTrip.equals(buffer)).toBe(true);

        await store.deleteAttachmentFile(tempDir, rel);
        // 再次删除不得抛错（ENOENT 被忽略）
        await expect(store.deleteAttachmentFile(tempDir, rel)).resolves.toBeUndefined();
    });

    test('cleanupOrphanedAttachments removes every listed file', async () => {
        const buffer = makePng(8, 8);
        await store.saveAttachmentFile({ attachmentDir: tempDir, relativePath: 'c/a.png', buffer });
        await store.saveAttachmentFile({ attachmentDir: tempDir, relativePath: 'c/b.png', buffer });
        const removed = await store.cleanupOrphanedAttachments({
            attachmentDir: tempDir,
            paths: [{ relativePath: 'c/a.png' }, { relativePath: 'c/b.png' }],
        });
        expect(removed).toBe(2);
    });
});
