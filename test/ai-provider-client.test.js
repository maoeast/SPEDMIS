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

    test('keeps streaming past the timeout as long as chunks keep arriving', async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: jest.fn(async () => ''),
            body: {
                async *[Symbol.asyncIterator]() {
                    // 相邻 chunk 间隔 40ms，总时长约 120ms 超过 timeoutMs(80)；
                    // 但任意两次到达之间 < 80ms，属正常流式，不应判超时。
                    for (const chunk of [
                        'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
                        'data: {"choices":[{"delta":{"content":"b"}}]}\n\n',
                        'data: {"choices":[{"delta":{"content":"c"}}]}\n\n',
                        'data: [DONE]\n\n',
                    ]) {
                        await sleep(40);
                        yield Buffer.from(chunk, 'utf8');
                    }
                },
            },
        }));
        const client = new AIProviderClient({ fetchImpl, timeoutMs: 80 });
        const result = await client.streamChat({
            apiKey: 'k',
            baseUrl: 'https://example.com/v1',
            model: 'm',
            messages: [{ role: 'user', content: 'hi' }],
        });
        expect(result.content).toBe('abc');
    });

    test('reports a streaming stall when chunks stop arriving mid-response', async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const fetchImpl = jest.fn((_url, options) => ({
            ok: true,
            status: 200,
            text: jest.fn(async () => ''),
            body: {
                async *[Symbol.asyncIterator]() {
                    yield Buffer.from('data: {"choices":[{"delta":{"content":"a"}}]}\n\n', 'utf8');
                    // 产出一段后长时间无后续数据 → 空闲超时
                    await sleep(120);
                    // 真实 fetch 流在 abort 后读取会抛 AbortError，此处模拟该行为
                    if (options.signal?.aborted) {
                        const error = new Error('aborted');
                        error.name = 'AbortError';
                        throw error;
                    }
                    yield Buffer.from('data: [DONE]\n\n', 'utf8');
                },
            },
        }));
        const client = new AIProviderClient({ fetchImpl, timeoutMs: 50 });
        await expect(client.streamChat({
            apiKey: 'k',
            baseUrl: 'https://example.com/v1',
            model: 'm',
            messages: [{ role: 'user', content: 'hi' }],
        })).rejects.toMatchObject({ kind: 'timeout', message: '模型响应停滞，请稍后重试。' });
    });

    test('rejects non-HTTPS and credential-bearing base URLs', () => {
        expect(() => validateHttpsBaseUrl('http://example.com')).toThrow(AIProviderError);
        expect(() => validateHttpsBaseUrl('https://user:pass@example.com')).toThrow(AIProviderError);
        expect(validateHttpsBaseUrl('https://example.com/v1/')).toBe('https://example.com/v1');
    });

    test('completeChat parses content, tool_calls and usage, sending tools + tool_choice auto', async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                choices: [{
                    message: {
                        content: '已查询',
                        tool_calls: [{
                            id: 'call_1',
                            type: 'function',
                            function: { name: 'search_intervention_apps', arguments: '{"domain":"感知觉统合"}' },
                        }],
                    },
                }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            }),
        }));
        const client = new AIProviderClient({ fetchImpl });
        const result = await client.completeChat({
            apiKey: 'k',
            baseUrl: 'https://example.com/v1',
            model: 'm',
            providerName: 'P',
            messages: [{ role: 'user', content: '有哪些应用' }],
            tools: [{ type: 'function', function: { name: 'x', parameters: { type: 'object' } } }],
        });
        expect(result.content).toBe('已查询');
        expect(result.toolCalls).toEqual([expect.objectContaining({
            id: 'call_1',
            function: expect.objectContaining({ name: 'search_intervention_apps' }),
        })]);
        expect(result.usage).toMatchObject({ totalTokens: 15, status: 'exact' });
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.stream).toBe(false);
        expect(body.tool_choice).toBe('auto');
        expect(Array.isArray(body.tools)).toBe(true);
    });

    test('completeChat returns empty toolCalls and omits tools when none provided', async () => {
        const client = new AIProviderClient({
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                json: async () => ({ choices: [{ message: { content: '回答' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
            }),
        });
        const result = await client.completeChat({
            apiKey: 'k', baseUrl: 'https://example.com/v1', model: 'm', providerName: 'P',
            messages: [{ role: 'user', content: 'hi' }],
        });
        expect(result.toolCalls).toEqual([]);
    });

    test('completeChat propagates an aborted signal as cancelled', async () => {
        const client = new AIProviderClient({ fetchImpl: async () => { throw new Error('not reached'); }, timeoutMs: 5000 });
        const controller = new AbortController();
        controller.abort();
        await expect(client.completeChat({
            apiKey: 'k', baseUrl: 'https://example.com/v1', model: 'm', providerName: 'P',
            messages: [{ role: 'user', content: 'hi' }], signal: controller.signal,
        })).rejects.toMatchObject({ kind: 'cancelled' });
    });

    test('normalizeMessages keeps multimodal array content, assistant tool_calls, and tool results; drops malformed tool rows', async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
        }));
        const client = new AIProviderClient({ fetchImpl });
        await client.completeChat({
            apiKey: 'k', baseUrl: 'https://example.com/v1', model: 'm', providerName: 'P',
            messages: [
                { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
                { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 't', arguments: '{}' } }] },
                { role: 'tool', tool_call_id: 'c1', content: '结果' },
                { role: 'tool', content: '无 tool_call_id 应被丢弃' },
            ],
        });
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.messages).toEqual([
            { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
            { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 't', arguments: '{}' } }] },
            { role: 'tool', tool_call_id: 'c1', content: '结果' },
        ]);
    });
});
