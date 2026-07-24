const { randomUUID } = require('crypto');
const { AISecretError } = require('./ai-secret-store');
const { AIProviderError, validateHttpsBaseUrl } = require('./ai-provider-client');
const { AIDatabaseError, DEFAULT_OWNER_KEY } = require('./ai-database');
const { buildPromptMessages } = require('./ai-prompt-builder');

const PRIVACY_NOTICE_VERSION = '2026-07-23-v1';
const MAX_MESSAGE_LENGTH = 30000;
const MAX_TITLE_LENGTH = 80;
const MAX_MODEL_LENGTH = 200;
const MAX_BASE_URL_LENGTH = 500;
const MAX_API_KEY_LENGTH = 4096;

class AIServiceError extends Error {
    constructor(kind, message) {
        super(message);
        this.name = 'AIServiceError';
        this.kind = kind;
    }
}

function requireString(value, fieldName, maximumLength) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        throw new AIServiceError('invalid_input', `${fieldName} 不能为空。`);
    }
    if (normalized.length > maximumLength) {
        throw new AIServiceError('invalid_input', `${fieldName} 内容过长。`);
    }
    return normalized;
}

function optionalId(value, fieldName = '标识') {
    return requireString(value, fieldName, 128);
}

function toPublicAIError(error) {
    if (
        error instanceof AIServiceError
        || error instanceof AISecretError
        || error instanceof AIProviderError
        || error instanceof AIDatabaseError
    ) {
        return {
            kind: error.kind || 'internal',
            message: error.message,
        };
    }

    return {
        kind: 'internal',
        message: 'AI 助手处理请求时发生内部错误，请稍后重试。',
    };
}

class AIAssistantService {
    constructor(options = {}) {
        if (!options.database || !options.secretStore || !options.providerClient) {
            throw new Error('database, secretStore and providerClient are required');
        }
        this.database = options.database;
        this.secretStore = options.secretStore;
        this.providerClient = options.providerClient;
        this.ownerKey = options.ownerKey || DEFAULT_OWNER_KEY;
        this.privacyVersion = options.privacyVersion || PRIVACY_NOTICE_VERSION;
        this.requestIdFactory = options.requestIdFactory || randomUUID;
        this.defer = options.defer || ((callback) => setImmediate(callback));
        this.logger = options.logger || null;
        this.activeRequests = new Map();
        this.activeConversationRequests = new Map();
        this.initialized = false;
        this.closed = false;
    }

    async initialize() {
        await this.database.initialize();
        this.initialized = true;
        this.closed = false;
        return this;
    }

    _assertReady() {
        if (!this.initialized || this.closed) {
            throw new AIServiceError('service_unavailable', 'AI 助手尚未就绪，请稍后重试。');
        }
    }

    bootstrap() {
        this._assertReady();
        return this.database.getBootstrap(this.ownerKey, this.privacyVersion);
    }

    async saveProvider(payload = {}) {
        this._assertReady();
        const code = requireString(payload.code, 'Provider', 50);
        const existing = this.database.getProvider(code);
        if (!existing) {
            throw new AIServiceError('provider_not_found', '不支持该 Provider。');
        }

        const baseUrlInput = requireString(payload.baseUrl, 'Base URL', MAX_BASE_URL_LENGTH);
        const baseUrl = validateHttpsBaseUrl(baseUrlInput);
        const model = requireString(payload.model, '模型或接入点 ID', MAX_MODEL_LENGTH);
        const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
        if (apiKey.length > MAX_API_KEY_LENGTH) {
            throw new AIServiceError('invalid_input', 'API Key 内容过长。');
        }

        const apiKeyEncrypted = apiKey ? this.secretStore.protectApiKey(apiKey) : undefined;
        return this.database.saveProvider({
            ownerKey: this.ownerKey,
            code,
            baseUrl,
            model,
            apiKeyEncrypted,
        });
    }

    async clearProvider(codeValue) {
        this._assertReady();
        const code = requireString(codeValue, 'Provider', 50);
        return this.database.clearProviderKey(code);
    }

    async testProvider(codeValue) {
        this._assertReady();
        const code = requireString(codeValue, 'Provider', 50);
        const provider = this.database.getProvider(code);
        if (!provider) {
            throw new AIServiceError('provider_not_found', '不支持该 Provider。');
        }
        if (!provider.model) {
            throw new AIServiceError('invalid_configuration', '请先配置模型或火山方舟接入点 ID。');
        }
        const apiKey = this.secretStore.revealApiKey(provider.apiKeyEncrypted);
        return this.providerClient.testConnection({
            apiKey,
            baseUrl: provider.baseUrl,
            model: provider.model,
            providerName: provider.name,
        });
    }

    listConversations() {
        this._assertReady();
        return this.database.listConversations(this.ownerKey);
    }

    async createConversation(payload = {}) {
        this._assertReady();
        const agentCode = requireString(payload.agentCode, '智能体', 100);
        const title = typeof payload.title === 'string' && payload.title.trim()
            ? requireString(payload.title, '会话标题', MAX_TITLE_LENGTH)
            : undefined;
        return this.database.createConversation(this.ownerKey, agentCode, title);
    }

    async renameConversation(payload = {}) {
        this._assertReady();
        const conversationId = optionalId(payload.conversationId, '会话标识');
        const title = requireString(payload.title, '会话标题', MAX_TITLE_LENGTH);
        return this.database.renameConversation(this.ownerKey, conversationId, title);
    }

    async deleteConversation(payload = {}) {
        this._assertReady();
        const conversationId = optionalId(payload.conversationId, '会话标识');
        const activeRequestId = this.activeConversationRequests.get(conversationId);
        if (activeRequestId) {
            this.activeRequests.get(activeRequestId)?.controller.abort();
        }
        return this.database.deleteConversation(this.ownerKey, conversationId);
    }

    listMessages(payload = {}) {
        this._assertReady();
        const conversationId = optionalId(payload.conversationId, '会话标识');
        const limit = payload.limit === undefined ? 100 : Number(payload.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
            throw new AIServiceError('invalid_input', '消息分页数量无效。');
        }
        const before = payload.before === undefined || payload.before === null
            ? undefined
            : requireString(payload.before, '分页时间', 50);
        return this.database.listMessages(this.ownerKey, conversationId, { limit, before });
    }

    async acceptPrivacy(payload = {}) {
        this._assertReady();
        if (payload.accepted !== true) {
            throw new AIServiceError('privacy_not_accepted', '需要明确同意隐私告知后才能发送内容。');
        }
        return this.database.acceptPrivacy(this.ownerKey, this.privacyVersion);
    }

    async updateBudget(payload = {}) {
        this._assertReady();
        const monthlyTokenLimit = Number(payload.monthlyTokenLimit);
        if (!Number.isInteger(monthlyTokenLimit) || monthlyTokenLimit < 0 || monthlyTokenLimit > 1000000000) {
            throw new AIServiceError('invalid_input', '月度 Token 额度必须是 0 到 1,000,000,000 之间的整数。');
        }
        if (typeof payload.hardLimitEnabled !== 'boolean') {
            throw new AIServiceError('invalid_input', '硬截断设置无效。');
        }
        const preference = await this.database.updateBudget(
            this.ownerKey,
            monthlyTokenLimit,
            payload.hardLimitEnabled
        );
        return {
            preference,
            usage: this.database.getMonthlyUsage(this.ownerKey),
        };
    }

    async startChat(payload = {}, sender) {
        this._assertReady();
        const conversationId = optionalId(payload.conversationId, '会话标识');
        const content = requireString(payload.content, '消息', MAX_MESSAGE_LENGTH);
        if (!sender || typeof sender.send !== 'function' || sender.id === undefined) {
            throw new AIServiceError('invalid_sender', 'AI 窗口通信上下文无效。');
        }
        if (this.activeConversationRequests.has(conversationId)) {
            throw new AIServiceError('request_in_progress', '当前会话已有回复正在生成。');
        }

        const conversation = this.database.getConversation(this.ownerKey, conversationId);
        if (!conversation) {
            throw new AIServiceError('conversation_not_found', '未找到指定的会话。');
        }
        const agent = this.database.getAgent(conversation.agentCode);
        if (!agent) {
            throw new AIServiceError('agent_not_found', '该会话的智能体不可用。');
        }

        const preference = this.database.getPreference(this.ownerKey);
        if (preference.privacyVersion !== this.privacyVersion || !preference.privacyAcceptedAt) {
            throw new AIServiceError('privacy_required', '首次发送前需要确认隐私告知。');
        }
        const usage = this.database.getMonthlyUsage(this.ownerKey);
        if (preference.hardLimitEnabled && usage.totalTokens >= preference.monthlyTokenLimit) {
            throw new AIServiceError('budget_exceeded', '本月 Token 用量已达到硬截断额度。');
        }

        const provider = this.database.getProvider(preference.currentProviderCode);
        if (!provider || !provider.hasApiKey) {
            throw new AIServiceError('api_key_unavailable', '请先保存当前 Provider 的 API Key。');
        }
        if (!provider.model) {
            throw new AIServiceError('invalid_configuration', '请先配置模型或火山方舟接入点 ID。');
        }
        const apiKey = this.secretStore.revealApiKey(provider.apiKeyEncrypted);

        const pair = await this.database.createMessagePair(this.ownerKey, conversationId, content);
        const promptMessages = buildPromptMessages({
            systemPrompt: agent.systemPrompt,
            messages: this.database.listPromptMessages(this.ownerKey, conversationId),
        });
        const requestId = this.requestIdFactory();
        const entry = {
            requestId,
            conversationId,
            assistantMessageId: pair.assistantMessage.id,
            controller: new AbortController(),
            sender,
            senderId: sender.id,
            provider,
            apiKey,
            promptMessages,
            partialContent: '',
            completionPromise: null,
        };

        this.activeRequests.set(requestId, entry);
        this.activeConversationRequests.set(conversationId, requestId);
        entry.completionPromise = new Promise((resolve) => this.defer(resolve))
            .then(() => this._runChat(entry));

        return {
            requestId,
            conversationId,
            userMessage: pair.userMessage,
            assistantMessage: pair.assistantMessage,
            conversation: pair.conversation,
            budgetWarning: !preference.hardLimitEnabled && usage.totalTokens >= preference.monthlyTokenLimit,
        };
    }

    async _runChat(entry) {
        try {
            const result = await this.providerClient.streamChat({
                apiKey: entry.apiKey,
                baseUrl: entry.provider.baseUrl,
                model: entry.provider.model,
                providerName: entry.provider.name,
                messages: entry.promptMessages,
                signal: entry.controller.signal,
                onDelta: (delta) => {
                    entry.partialContent += delta;
                    this._send(entry, 'ai:chat:delta', {
                        requestId: entry.requestId,
                        conversationId: entry.conversationId,
                        delta,
                    });
                },
            });

            const message = await this.database.completeAssistantMessage(
                this.ownerKey,
                entry.conversationId,
                entry.assistantMessageId,
                result.content,
                result.usage
            );
            const preference = this.database.getPreference(this.ownerKey);
            const usage = this.database.getMonthlyUsage(this.ownerKey);
            this._send(entry, 'ai:chat:done', {
                requestId: entry.requestId,
                conversationId: entry.conversationId,
                message,
                usage,
                overLimit: usage.totalTokens >= preference.monthlyTokenLimit,
            });
        } catch (error) {
            const publicError = toPublicAIError(error);
            const messageStatus = publicError.kind === 'cancelled' ? 'cancelled' : 'error';
            let message = null;
            try {
                message = await this.database.failAssistantMessage(
                    this.ownerKey,
                    entry.conversationId,
                    entry.assistantMessageId,
                    messageStatus,
                    publicError.kind,
                    entry.partialContent
                );
            } catch (databaseError) {
                this.logger?.error?.('Failed to persist AI chat failure', {
                    kind: toPublicAIError(databaseError).kind,
                });
            }

            this._send(entry, 'ai:chat:error', {
                requestId: entry.requestId,
                conversationId: entry.conversationId,
                error: publicError,
                message,
            });
        } finally {
            entry.apiKey = '';
            this.activeRequests.delete(entry.requestId);
            if (this.activeConversationRequests.get(entry.conversationId) === entry.requestId) {
                this.activeConversationRequests.delete(entry.conversationId);
            }
        }
    }

    _send(entry, channel, payload) {
        try {
            if (!entry.sender.isDestroyed?.()) {
                entry.sender.send(channel, payload);
            }
        } catch {
            // Closing the AI window must not affect persistence or request cleanup.
        }
    }

    cancelChat(payload = {}, senderId) {
        this._assertReady();
        const requestId = optionalId(payload.requestId, '请求标识');
        const conversationId = optionalId(payload.conversationId, '会话标识');
        const entry = this.activeRequests.get(requestId);
        if (!entry || entry.conversationId !== conversationId || entry.senderId !== senderId) {
            return false;
        }
        entry.controller.abort();
        return true;
    }

    cancelForSender(senderId) {
        let cancelled = 0;
        for (const entry of this.activeRequests.values()) {
            if (entry.senderId === senderId) {
                entry.controller.abort();
                cancelled += 1;
            }
        }
        return cancelled;
    }

    cancelAll() {
        for (const entry of this.activeRequests.values()) {
            entry.controller.abort();
        }
    }

    async close() {
        if (this.closed) {
            return;
        }
        this.cancelAll();
        await Promise.allSettled(
            [...this.activeRequests.values()]
                .map((entry) => entry.completionPromise)
                .filter(Boolean)
        );
        await this.database.close();
        this.closed = true;
        this.initialized = false;
    }
}

module.exports = {
    PRIVACY_NOTICE_VERSION,
    MAX_MESSAGE_LENGTH,
    AIServiceError,
    AIAssistantService,
    toPublicAIError,
    requireString,
};
