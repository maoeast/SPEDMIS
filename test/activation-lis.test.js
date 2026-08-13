jest.mock('../logger', () => ({
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }))
}));

const {
    LIS_FORMAT_VERSION,
    buildLisContent,
    parseLisContent,
    buildLisFileName,
} = require('../modules/activation-lis');

const VALID_MACHINE_CODE = 'abababababababababababababababababababababababababababababababab';
const VALID_ACTIVATION_CODE = 'fe6fc2f85e2da99b2d031f2a164f9eb370cb7d4e98894cc27db21c8618c2d012';

describe('activation lis buildLisContent', () => {
    test('should build valid lis content with header and fields', () => {
        const content = buildLisContent(VALID_MACHINE_CODE, VALID_ACTIVATION_CODE, {
            issuedAt: '2026-08-13T00:00:00.000Z',
        });

        expect(content).toContain(`# SPEDMIS Activation File ${LIS_FORMAT_VERSION}`);
        expect(content).toContain(`machineCode=${VALID_MACHINE_CODE}`);
        expect(content).toContain(`activationCode=${VALID_ACTIVATION_CODE}`);
        expect(content).toContain('issuedAt=2026-08-13T00:00:00.000Z');
    });

    test('should default issuedAt to current time', () => {
        const before = Date.now();
        const content = buildLisContent(VALID_MACHINE_CODE, VALID_ACTIVATION_CODE);
        const match = content.match(/issuedAt=(.+)\n/);
        const issuedAt = new Date(match[1]).getTime();
        expect(issuedAt).toBeGreaterThanOrEqual(before - 1000);
        expect(issuedAt).toBeLessThanOrEqual(Date.now() + 1000);
    });

    test('should trim whitespace around codes', () => {
        const content = buildLisContent(`  ${VALID_MACHINE_CODE}  `, `\n${VALID_ACTIVATION_CODE}\n`);
        expect(content).toContain(`machineCode=${VALID_MACHINE_CODE}`);
        expect(content).toContain(`activationCode=${VALID_ACTIVATION_CODE}`);
    });

    test('should reject invalid machine code', () => {
        expect(() => buildLisContent('not-hex', VALID_ACTIVATION_CODE)).toThrow('机器码格式不正确');
        expect(() => buildLisContent(VALID_MACHINE_CODE.slice(0, 32), VALID_ACTIVATION_CODE)).toThrow('机器码格式不正确');
        expect(() => buildLisContent('', VALID_ACTIVATION_CODE)).toThrow('机器码格式不正确');
    });

    test('should reject invalid activation code', () => {
        expect(() => buildLisContent(VALID_MACHINE_CODE, '1234')).toThrow('激活码格式不正确');
        expect(() => buildLisContent(VALID_MACHINE_CODE, 'z'.repeat(64))).toThrow('激活码格式不正确');
    });
});

describe('activation lis parseLisContent', () => {
    test('should parse valid content', () => {
        const content = buildLisContent(VALID_MACHINE_CODE, VALID_ACTIVATION_CODE, {
            issuedAt: '2026-08-13T00:00:00.000Z',
        });

        const parsed = parseLisContent(content);
        expect(parsed).toEqual({
            machineCode: VALID_MACHINE_CODE,
            activationCode: VALID_ACTIVATION_CODE,
            issuedAt: '2026-08-13T00:00:00.000Z',
        });
    });

    test('should tolerate BOM, CRLF and comment lines', () => {
        const content = `\uFEFF# SPEDMIS Activation File ${LIS_FORMAT_VERSION}\r\nmachineCode=${VALID_MACHINE_CODE}\r\n# 注释行\r\nactivationCode=${VALID_ACTIVATION_CODE}\r\n`;

        const parsed = parseLisContent(content);
        expect(parsed.machineCode).toBe(VALID_MACHINE_CODE);
        expect(parsed.activationCode).toBe(VALID_ACTIVATION_CODE);
    });

    test('should be case-insensitive for keys and ignore unknown lines', () => {
        const content = [
            '# SPEDMIS Activation File v1',
            'MACHINECODE=' + VALID_MACHINE_CODE,
            'unknownKey=ignored',
            'ActivationCode=' + VALID_ACTIVATION_CODE,
        ].join('\n');

        const parsed = parseLisContent(content);
        expect(parsed.machineCode).toBe(VALID_MACHINE_CODE);
        expect(parsed.activationCode).toBe(VALID_ACTIVATION_CODE);
        expect(parsed.issuedAt).toBeUndefined();
    });

    test('should lower-case hex codes', () => {
        const content = [
            `machineCode=${VALID_MACHINE_CODE.toUpperCase()}`,
            `activationCode=${VALID_ACTIVATION_CODE.toUpperCase()}`,
        ].join('\n');

        const parsed = parseLisContent(content);
        expect(parsed.machineCode).toBe(VALID_MACHINE_CODE);
        expect(parsed.activationCode).toBe(VALID_ACTIVATION_CODE);
    });

    test('should reject empty content', () => {
        expect(() => parseLisContent('')).toThrow('激活文件内容为空');
        expect(() => parseLisContent('   \n# only comments\n')).toThrow('缺少机器码字段');
    });

    test('should reject missing activationCode', () => {
        expect(() => parseLisContent(`machineCode=${VALID_MACHINE_CODE}`)).toThrow('缺少激活码字段');
    });

    test('should reject invalid code formats', () => {
        const missingMachineCode = `machineCode=short\nactivationCode=${VALID_ACTIVATION_CODE}`;
        expect(() => parseLisContent(missingMachineCode)).toThrow('机器码格式不正确');

        const missingActivationCode = `machineCode=${VALID_MACHINE_CODE}\nactivationCode=zzzz`;
        expect(() => parseLisContent(missingActivationCode)).toThrow('激活码格式不正确');
    });

    test('should reject non-string input', () => {
        expect(() => parseLisContent(null)).toThrow('激活文件内容为空');
        expect(() => parseLisContent(undefined)).toThrow('激活文件内容为空');
        expect(() => parseLisContent(123)).toThrow('激活文件内容为空');
    });
});

describe('activation lis buildLisFileName', () => {
    test('should use first 8 chars of machine code', () => {
        expect(buildLisFileName(VALID_MACHINE_CODE)).toBe('SPEDMIS-abababab.lis');
    });

    test('should fall back for invalid input', () => {
        expect(buildLisFileName('')).toBe('SPEDMIS-ACTIVATION.lis');
        expect(buildLisFileName(undefined)).toBe('SPEDMIS-ACTIVATION.lis');
        expect(buildLisFileName('short')).toBe('SPEDMIS-ACTIVATION.lis');
    });
});
