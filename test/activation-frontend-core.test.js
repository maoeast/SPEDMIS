/**
 * 验证 activation-tool-gui.html（单文件版）内嵌的核心纯函数逻辑。
 * 方法：提取 <script> 内容，在 vm 沙箱中执行（无 DOM 环境自动跳过 DOM 绑定），
 * 通过 LisTool 全局对象调用纯函数断言。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const htmlPath = path.join(__dirname, '..', 'tools', 'activation-tool-gui.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
    throw new Error('未在 activation-tool-gui.html 中找到 <script> 块');
}

const context = vm.createContext({
    crypto: globalThis.crypto,
    TextEncoder: globalThis.TextEncoder,
    Uint8Array: globalThis.Uint8Array,
    Uint32Array: globalThis.Uint32Array,
    Array: globalThis.Array,
    Object: globalThis.Object,
    String: globalThis.String,
    RegExp: globalThis.RegExp,
    Date: globalThis.Date,
    Promise: globalThis.Promise,
    Error: globalThis.Error,
    console: console,
});

vm.runInContext(scriptMatch[1], context);

const LisTool = context.LisTool;
const DEFAULT_KEY = LisTool.DEFAULT_SECRET_KEY;
const MACHINE = 'abababababababababababababababababababababababababababababababab';
const CODE = 'fe6fc2f85e2da99b2d031f2a164f9eb370cb7d4e98894cc27db21c8618c2d012';

/** 简易 ZIP 读取器（STORE 模式，验证 round-trip） */
function readZipBytes(bytes) {
    const buffer = Buffer.from(bytes);
    const eocdOffset = buffer.length - 22;
    expect(buffer.readUInt32LE(eocdOffset)).toBe(0x06054b50);
    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const cdSize = buffer.readUInt32LE(eocdOffset + 12);
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

    const files = [];
    let cursor = cdOffset;
    for (let i = 0; i < totalEntries; i++) {
        expect(buffer.readUInt32LE(cursor)).toBe(0x02014b50);
        const nameLen = buffer.readUInt16LE(cursor + 28);
        const extraLen = buffer.readUInt16LE(cursor + 30);
        const commentLen = buffer.readUInt16LE(cursor + 32);
        const localOffset = buffer.readUInt32LE(cursor + 42);
        const name = buffer.toString('ascii', cursor + 46, cursor + 46 + nameLen);

        expect(buffer.readUInt32LE(localOffset)).toBe(0x04034b50);
        const localNameLen = buffer.readUInt16LE(localOffset + 26);
        const localExtraLen = buffer.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        const dataSize = buffer.readUInt32LE(localOffset + 22);
        const content = buffer.toString('utf8', dataStart, dataStart + dataSize);

        files.push({ name, content });
        cursor += 46 + nameLen + extraLen + commentLen;
    }
    expect(cursor).toBe(cdOffset + cdSize);
    return files;
}

describe('activation gui single-file core (LisTool)', () => {
    test('script should expose LisTool with all core functions', () => {
        expect(LisTool).toBeDefined();
        expect(typeof LisTool.hmacHex).toBe('function');
        expect(typeof LisTool.generateCode).toBe('function');
        expect(typeof LisTool.buildLisContent).toBe('function');
        expect(typeof LisTool.parseLisContent).toBe('function');
        expect(typeof LisTool.createZip).toBe('function');
        expect(typeof LisTool.extractMachineCodes).toBe('function');
    });

    test('DEFAULT_SECRET_KEY should be at least 32 chars', () => {
        expect(DEFAULT_KEY.length).toBeGreaterThanOrEqual(32);
    });

    describe('hmacHex', () => {
        test('should match Node crypto HMAC-SHA256 (algorithm parity with main app)', async () => {
            const expected = crypto.createHmac('sha256', DEFAULT_KEY).update(MACHINE).digest('hex');
            const actual = await LisTool.hmacHex(DEFAULT_KEY, MACHINE);
            expect(actual).toBe(expected);
            expect(actual).toHaveLength(64);
        });

        test('should produce deterministic results', async () => {
            const a = await LisTool.hmacHex(DEFAULT_KEY, MACHINE);
            const b = await LisTool.hmacHex(DEFAULT_KEY, MACHINE);
            expect(a).toBe(b);
        });
    });

    describe('generateCode', () => {
        test('should generate a valid 64-hex code', async () => {
            const result = await LisTool.generateCode(DEFAULT_KEY, MACHINE);
            expect(result.success).toBe(true);
            expect(result.activationCode).toHaveLength(64);
            expect(result.activationCode).toMatch(/^[a-f0-9]{64}$/);
            expect(result.activationCode).toBe(CODE);
        });

        test('should reject invalid machine code', async () => {
            const short = await LisTool.generateCode(DEFAULT_KEY, 'abc');
            expect(short.success).toBe(false);

            const notHex = await LisTool.generateCode(DEFAULT_KEY, 'z'.repeat(64));
            expect(notHex.success).toBe(false);
        });

        test('should reject short secret key', async () => {
            const result = await LisTool.generateCode('short', MACHINE);
            expect(result.success).toBe(false);
        });
    });

    describe('buildLisContent / parseLisContent', () => {
        test('should round-trip content', () => {
            const content = LisTool.buildLisContent(MACHINE, CODE, '2026-08-13T00:00:00.000Z');
            const parsed = LisTool.parseLisContent(content);
            expect(parsed).toEqual({
                machineCode: MACHINE,
                activationCode: CODE,
                issuedAt: '2026-08-13T00:00:00.000Z',
            });
        });

        test('should tolerate BOM, CRLF and comments', () => {
            const content = '\uFEFF# comment\r\nmachineCode=' + MACHINE + '\r\nactivationCode=' + CODE + '\r\n';
            const parsed = LisTool.parseLisContent(content);
            expect(parsed.machineCode).toBe(MACHINE);
            expect(parsed.activationCode).toBe(CODE);
        });

        test('should reject missing fields', () => {
            expect(() => LisTool.parseLisContent('machineCode=' + MACHINE)).toThrow('缺少激活码字段');
            expect(() => LisTool.parseLisContent('')).toThrow('激活文件内容为空');
        });

        test('buildLisFileName should use first 8 chars', () => {
            expect(LisTool.buildLisFileName(MACHINE)).toBe('SPEDMIS-abababab.lis');
        });
    });

    describe('crc32 / createZip (single-file zip)', () => {
        test('crc32 should match standard check value', () => {
            const enc = new TextEncoder();
            expect(LisTool.crc32(enc.encode('123456789'))).toBe(0xCBF43926);
        });

        test('createZip should produce valid zip and round-trip contents', () => {
            const files = [
                { name: 'SPEDMIS-aaaa1111.lis', content: 'machineCode=aaaa' },
                { name: 'SPEDMIS-bbbb2222.lis', content: 'activationCode=bbbb\n第二行' },
            ];
            const zip = LisTool.createZip(files);
            expect(zip).toBeInstanceOf(Uint8Array);
            const extracted = readZipBytes(zip);
            expect(extracted).toHaveLength(2);
            expect(extracted[0].name).toBe('SPEDMIS-aaaa1111.lis');
            expect(extracted[0].content).toBe('machineCode=aaaa');
            expect(extracted[1].content).toBe('activationCode=bbbb\n第二行');
        });

        test('createZip should reject non-ASCII names and empty list', () => {
            expect(() => LisTool.createZip([])).toThrow('文件列表不能为空');
            expect(() => LisTool.createZip([{ name: '中文.lis', content: 'x' }])).toThrow('文件名必须为 ASCII 字符');
        });
    });

    describe('extractMachineCodes', () => {
        test('should parse single column with header', () => {
            const codes = LisTool.extractMachineCodes('机器码\n' + MACHINE + '\n' + CODE.slice(0, 64).replace(/./g, 'f'), true);
            expect(codes).toHaveLength(2);
        });

        test('should take first column of multi-column CSV and skip blank lines', () => {
            const text = MACHINE + ',extra\n\n' + 'ef'.repeat(32) + '\t其他';
            const codes = LisTool.extractMachineCodes(text, false);
            expect(codes).toEqual([MACHINE, 'ef'.repeat(32)]);
        });

        test('should return empty for blank content', () => {
            expect(LisTool.extractMachineCodes('   \n\n', false)).toEqual([]);
        });
    });
});
