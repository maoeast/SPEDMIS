const { validateArguments } = require('../modules/ai-tool-validator');

const SCHEMA = {
    type: 'object',
    properties: {
        domain: { type: 'string', enum: ['感知觉统合', '执行功能'] },
        keyword: { type: 'string', maxLength: 5 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
};

describe('ai-tool-validator', () => {
    test('accepts a valid object and keeps only known keys', () => {
        const result = validateArguments(JSON.stringify({ domain: '执行功能', limit: 10 }), SCHEMA);
        expect(result.ok).toBe(true);
        expect(result.value).toEqual({ domain: '执行功能', limit: 10 });
        expect(result.errors).toEqual([]);
    });

    test('rejects an unknown key (additionalProperties defaults to false)', () => {
        const result = validateArguments(JSON.stringify({ evil: 'x' }), SCHEMA);
        expect(result.ok).toBe(false);
        expect(result.errors.some((message) => message.includes('evil'))).toBe(true);
        expect(result.value).toEqual({});
    });

    test('drops the unknown key from the returned value even when other keys are valid', () => {
        const result = validateArguments(JSON.stringify({ domain: '执行功能', evil: 'x' }), SCHEMA);
        expect(result.ok).toBe(false);
        expect(result.value).toEqual({ domain: '执行功能' });
    });

    test('rejects a type mismatch', () => {
        const result = validateArguments(JSON.stringify({ limit: 'wide' }), SCHEMA);
        expect(result.ok).toBe(false);
        expect(result.errors.some((message) => message.includes('limit'))).toBe(true);
    });

    test('rejects a non-integer for an integer field', () => {
        const result = validateArguments(JSON.stringify({ limit: 1.5 }), SCHEMA);
        expect(result.ok).toBe(false);
    });

    test('rejects an enum violation', () => {
        const result = validateArguments(JSON.stringify({ domain: '黑客' }), SCHEMA);
        expect(result.ok).toBe(false);
    });

    test('rejects out-of-range numbers', () => {
        expect(validateArguments(JSON.stringify({ limit: 0 }), SCHEMA).ok).toBe(false);
        expect(validateArguments(JSON.stringify({ limit: 999 }), SCHEMA).ok).toBe(false);
    });

    test('rejects strings exceeding maxLength', () => {
        expect(validateArguments(JSON.stringify({ keyword: 'abcdefg' }), SCHEMA).ok).toBe(false);
    });

    test('rejects malformed JSON', () => {
        const result = validateArguments('{not json', SCHEMA);
        expect(result.ok).toBe(false);
        expect(result.errors.some((message) => message.includes('解析失败'))).toBe(true);
    });

    test('rejects non-object JSON (array / primitive)', () => {
        expect(validateArguments('[1,2]', SCHEMA).ok).toBe(false);
        expect(validateArguments('"x"', SCHEMA).ok).toBe(false);
        expect(validateArguments('null', SCHEMA).ok).toBe(false);
    });

    test('treats an empty arguments string as an empty object', () => {
        const result = validateArguments('', SCHEMA);
        expect(result.ok).toBe(true);
        expect(result.value).toEqual({});
    });

    test('reports missing required fields', () => {
        const result = validateArguments(JSON.stringify({}), { type: 'object', required: ['keyword'], properties: { keyword: { type: 'string' } } });
        expect(result.ok).toBe(false);
        expect(result.errors.some((message) => message.includes('keyword'))).toBe(true);
    });
});
