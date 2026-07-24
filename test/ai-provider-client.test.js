const {
    AIProviderClient,
    AIProviderError,
    validateHttpsBaseUrl,
} = require('../modules/ai-provider-client');

function streamResponse(chunks, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: jest.fn(async () => ''),
        body: {
            async *[Symbol.asyncIterator]() {
                for (const chunk of chunks) {
                    yield Buffer.from(chunk, 'utf8');
                }
            },
        },
    };
}

describe('AI provider client', () => {
    test('parses fragmented CRLF SSE content and exact token usage', async () => {
        const fetchImpl = jest.fn(async () => streamResponse([
            'data: {"choices":[{"delta":{"cont',
            'ent":"你"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"好"}}]}\r\n',
            '\r\ndata: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\r\n\r\n',
            'data: [DONE]\r\n\r\n',
        ]));
        const deltas = [];
        const client = new AIProviderClient({ fetchImpl });

        const result = await client.streamChat({
            apiKey: 'test-key',
            baseUrl: 'https://api.deepseek.com/',
            model: 'deepseek-chat',
            providerName: 'DeepSeek',
            messages: [{ role: 'user', content: '你好' }],
            onDelta: (delta) => deltas.push(delta),
        });

        expect(deltas).toEqual(['你', '好']);
        expect(result).toEqual({
            content: '你好',
            usage: {
                promptTokens: 3,
                completionTokens: 2,
                totalTokens: 5,
                status: 'exact',
            },
        });
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://api.deepseek.com/chat/completions',
            expect.objectContaining({ redirect: 'error' })
        );
    });

    test('marks usage unknown instead of inventing token counts', async () => {
        const client = new AIProviderClient({
            fetchImpl: async () => streamResponse([
                'data: {"choices":[{"delta":{"content":"完成"}}]}\n\n',
                'data: [DONE]\n\n',
            ]),
        });

        await expect(client.streamChat({
            apiKey: 'test-key',
            baseUrl: 'https://example.com/v1',
            model: 'model-id',
            messages: [{ role: 'user', content: 'test' }],
        })).resolves.toMatchObject({
            usage: { status: 'unknown', totalTokens: 0 },
        });
    });

    test('maps authentication failures without exposing provider response bodies', async () => {
        const response = streamResponse([], 401);
        response.text.mockResolvedValue('raw provider secret detail');
        const client = new AIProviderClient({ fetchImpl: async () => response });

        await expect(client.streamChat({
            apiKey: 'test-key',
            baseUrl: 'https://example.com/v1',
            model: 'model-id',
            providerName: '测试服务',
            messages: [{ role: 'user', content: 'test' }],
        })).rejects.toMatchObject({
            kind: 'auth',
            message: expect.not.stringContaining('raw provider'),
        });
    });

    test('distinguishes user cancellation from timeout', async () => {
        const fetchImpl = jest.fn((_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            });
        }));
        const client = new AIProviderClient({ fetchImpl, timeoutMs: 1000 });
        const controller = new AbortController();
        const request = client.streamChat({
            apiKey: 'test-key',
            baseUrl: 'https://example.com/v1',
            model: 'model-id',
            messages: [{ role: 'user', content: 'test' }],
            signal: controller.signal,
        });
        controller.abort();

        await expect(request).rejects.toMatchObject({ kind: 'cancelled' });
    });

    test('rejects non-HTTPS and credential-bearing base URLs', () => {
        expect(() => validateHttpsBaseUrl('http://example.com')).toThrow(AIProviderError);
        expect(() => validateHttpsBaseUrl('https://user:pass@example.com')).toThrow(AIProviderError);
        expect(validateHttpsBaseUrl('https://example.com/v1/')).toBe('https://example.com/v1');
    });
});
