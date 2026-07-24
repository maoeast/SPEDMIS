const REQUEST_TIMEOUT_MS = 60000;

const PROVIDER_PRESETS = Object.freeze({
    deepseek: Object.freeze({
        code: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        defaultModel: 'deepseek-chat',
        sort: 1,
    }),
    volcengine: Object.freeze({
        code: 'volcengine',
        name: '火山方舟',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        defaultModel: '',
        sort: 2,
    }),
});

class AIProviderError extends Error {
    constructor(kind, message, options = {}) {
        super(message);
        this.name = 'AIProviderError';
        this.kind = kind;
        this.httpStatus = options.httpStatus || null;
    }
}

function validateHttpsBaseUrl(value) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        throw new AIProviderError('invalid_configuration', 'Provider Base URL 不能为空。');
    }

    let parsed;
    try {
        parsed = new URL(normalized);
    } catch {
        throw new AIProviderError('invalid_configuration', 'Provider Base URL 格式无效。');
    }

    if (parsed.protocol !== 'https:') {
        throw new AIProviderError('invalid_configuration', 'Provider Base URL 必须使用 HTTPS。');
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new AIProviderError('invalid_configuration', 'Provider Base URL 不能包含凭据、查询参数或片段。');
    }

    return parsed.toString().replace(/\/$/, '');
}

function mapUsage(usage) {
    if (!usage || typeof usage !== 'object') {
        return null;
    }

    const promptTokens = Number(usage.prompt_tokens || 0);
    const completionTokens = Number(usage.completion_tokens || 0);
    const totalTokens = Number(usage.total_tokens || promptTokens + completionTokens);

    if (![promptTokens, completionTokens, totalTokens].every(Number.isFinite)) {
        return null;
    }

    return {
        promptTokens: Math.max(0, Math.floor(promptTokens)),
        completionTokens: Math.max(0, Math.floor(completionTokens)),
        totalTokens: Math.max(0, Math.floor(totalTokens)),
        status: 'exact',
    };
}

function describeHttpError(status, providerName = '模型服务') {
    if (status === 401 || status === 403) {
        return new AIProviderError('auth', `${providerName} 的 API Key 无效或无权访问当前模型。`, { httpStatus: status });
    }
    if (status === 402) {
        return new AIProviderError('insufficient_balance', `${providerName} 账户余额不足。`, { httpStatus: status });
    }
    if (status === 408) {
        return new AIProviderError('timeout', `${providerName} 请求超时，请稍后重试。`, { httpStatus: status });
    }
    if (status === 429) {
        return new AIProviderError('rate_limit', `${providerName} 请求过于频繁或触发额度限制，请稍后重试。`, { httpStatus: status });
    }
    if (status >= 500) {
        return new AIProviderError('server', `${providerName} 暂时不可用，请稍后重试。`, { httpStatus: status });
    }
    if (status === 404) {
        return new AIProviderError('invalid_configuration', `${providerName} 的地址或模型配置不正确。`, { httpStatus: status });
    }
    return new AIProviderError('request_rejected', `${providerName} 拒绝了请求（HTTP ${status}）。`, { httpStatus: status });
}

function normalizeMessages(messages) {
    if (!Array.isArray(messages)) {
        return [];
    }

    const allowedRoles = new Set(['system', 'user', 'assistant']);
    return messages
        .filter((message) => message && allowedRoles.has(message.role))
        .filter((message) => typeof message.content === 'string' && message.content.trim())
        .map((message) => ({ role: message.role, content: message.content }));
}

function createRequestController(externalSignal, timeoutMs) {
    const controller = new AbortController();
    let abortKind = null;

    const cancelFromExternal = () => {
        abortKind = 'cancelled';
        controller.abort();
    };

    if (externalSignal?.aborted) {
        cancelFromExternal();
    } else if (externalSignal) {
        externalSignal.addEventListener('abort', cancelFromExternal, { once: true });
    }

    const timer = setTimeout(() => {
        if (!controller.signal.aborted) {
            abortKind = 'timeout';
            controller.abort();
        }
    }, timeoutMs);

    return {
        signal: controller.signal,
        getAbortKind: () => abortKind,
        cleanup: () => {
            clearTimeout(timer);
            externalSignal?.removeEventListener?.('abort', cancelFromExternal);
        },
    };
}

function createAbortError(abortKind) {
    if (abortKind === 'cancelled') {
        return new AIProviderError('cancelled', '请求已停止。');
    }
    return new AIProviderError('timeout', `请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒），请稍后重试。`);
}

function parseSSEEvent(rawEvent) {
    const data = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim();

    if (!data || data === '[DONE]') {
        return null;
    }

    try {
        return JSON.parse(data);
    } catch {
        throw new AIProviderError('response_format', '模型服务返回了无法解析的流式数据。');
    }
}

async function readResponseChunks(body, onChunk) {
    if (!body) {
        throw new AIProviderError('response_format', '模型服务未返回可读取的响应流。');
    }

    if (typeof body.getReader === 'function') {
        const reader = body.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                onChunk(value);
            }
        } finally {
            reader.releaseLock?.();
        }
        return;
    }

    if (typeof body[Symbol.asyncIterator] === 'function') {
        for await (const value of body) {
            onChunk(value);
        }
        return;
    }

    throw new AIProviderError('response_format', '当前运行时无法读取模型服务响应流。');
}

class AIProviderClient {
    constructor(options = {}) {
        this.fetchImpl = options.fetchImpl || globalThis.fetch;
        this.timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
        if (typeof this.fetchImpl !== 'function') {
            throw new Error('A fetch implementation is required');
        }
    }

    async testConnection({ apiKey, baseUrl, model, providerName, signal }) {
        const normalizedMessages = [{ role: 'user', content: '请仅回复 OK。' }];
        const data = await this._requestJson({
            apiKey,
            baseUrl,
            model,
            providerName,
            signal,
            body: {
                model,
                messages: normalizedMessages,
                stream: false,
                max_tokens: 1,
            },
        });

        if (!data?.choices?.[0]?.message) {
            throw new AIProviderError('response_format', '模型服务连接成功，但响应格式不兼容。');
        }

        return {
            model: typeof data.model === 'string' ? data.model : model,
            usage: mapUsage(data.usage),
        };
    }

    async streamChat({ apiKey, baseUrl, model, providerName, messages, signal, onDelta }) {
        const normalizedMessages = normalizeMessages(messages);
        if (!normalizedMessages.some((message) => message.role === 'user')) {
            throw new AIProviderError('empty_message', '没有可发送的用户消息。');
        }

        const endpoint = `${validateHttpsBaseUrl(baseUrl)}/chat/completions`;
        const requestController = createRequestController(signal, this.timeoutMs);
        let response;

        try {
            response = await this.fetchImpl(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: normalizedMessages,
                    stream: true,
                    stream_options: { include_usage: true },
                }),
                redirect: 'error',
                signal: requestController.signal,
            });
        } catch (error) {
            requestController.cleanup();
            if (requestController.signal.aborted || error?.name === 'AbortError') {
                throw createAbortError(requestController.getAbortKind());
            }
            throw new AIProviderError('network', '无法连接模型服务，请检查网络和 Provider 地址。');
        }

        if (!response.ok) {
            requestController.cleanup();
            await response.text().catch(() => '');
            throw describeHttpError(response.status, providerName);
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let content = '';
        let usage = null;

        const consumeBuffer = (flush = false) => {
            buffer = buffer.replace(/\r\n/g, '\n');
            let separatorIndex = buffer.indexOf('\n\n');
            while (separatorIndex >= 0) {
                const rawEvent = buffer.slice(0, separatorIndex);
                buffer = buffer.slice(separatorIndex + 2);
                const eventData = parseSSEEvent(rawEvent);
                const delta = eventData?.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta) {
                    content += delta;
                    onDelta?.(delta);
                }
                if (eventData?.usage) {
                    usage = mapUsage(eventData.usage);
                }
                separatorIndex = buffer.indexOf('\n\n');
            }

            if (flush && buffer.trim()) {
                const eventData = parseSSEEvent(buffer.trim());
                const delta = eventData?.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta) {
                    content += delta;
                    onDelta?.(delta);
                }
                if (eventData?.usage) {
                    usage = mapUsage(eventData.usage);
                }
                buffer = '';
            }
        };

        try {
            await readResponseChunks(response.body, (value) => {
                buffer += decoder.decode(value, { stream: true });
                consumeBuffer();
            });
            buffer += decoder.decode();
            consumeBuffer(true);
        } catch (error) {
            if (requestController.signal.aborted || error?.name === 'AbortError') {
                throw createAbortError(requestController.getAbortKind());
            }
            if (error instanceof AIProviderError) {
                throw error;
            }
            throw new AIProviderError('network', '读取模型服务响应时连接中断。');
        } finally {
            requestController.cleanup();
        }

        if (!content) {
            throw new AIProviderError('response_format', '模型服务没有返回文本内容。');
        }

        return {
            content,
            usage: usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0, status: 'unknown' },
        };
    }

    async _requestJson({ apiKey, baseUrl, model, providerName, signal, body }) {
        if (typeof apiKey !== 'string' || !apiKey.trim()) {
            throw new AIProviderError('api_key_unavailable', '尚未配置 API Key。');
        }
        if (typeof model !== 'string' || !model.trim()) {
            throw new AIProviderError('invalid_configuration', '请先配置模型或火山方舟接入点 ID。');
        }

        const endpoint = `${validateHttpsBaseUrl(baseUrl)}/chat/completions`;
        const requestController = createRequestController(signal, this.timeoutMs);
        try {
            const response = await this.fetchImpl(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                redirect: 'error',
                signal: requestController.signal,
            });

            if (!response.ok) {
                await response.text().catch(() => '');
                throw describeHttpError(response.status, providerName);
            }

            try {
                return await response.json();
            } catch {
                throw new AIProviderError('response_format', '模型服务返回了无法解析的数据。');
            }
        } catch (error) {
            if (requestController.signal.aborted || error?.name === 'AbortError') {
                throw createAbortError(requestController.getAbortKind());
            }
            if (error instanceof AIProviderError) {
                throw error;
            }
            throw new AIProviderError('network', '无法连接模型服务，请检查网络和 Provider 地址。');
        } finally {
            requestController.cleanup();
        }
    }
}

module.exports = {
    REQUEST_TIMEOUT_MS,
    PROVIDER_PRESETS,
    AIProviderError,
    AIProviderClient,
    validateHttpsBaseUrl,
    mapUsage,
    describeHttpError,
    parseSSEEvent,
};
