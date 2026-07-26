const fs = require('fs');
const os = require('os');
const path = require('path');
const { AIAssistantDatabase } = require('../modules/ai-database');
const { AIProviderError } = require('../modules/ai-provider-client');
const { AIAssistantService } = require('../modules/ai-service');

describe('AI assistant service', () => {
    let tempDirectory;
    let database;
    let service;
    let providerClient;
    let deferredCallbacks;
    let sender;

    beforeEach(async () => {
        tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spedmis-ai-service-'));
        database = new AIAssistantDatabase({ dbPath: path.join(tempDirectory, 'ai-assistant.db') });
        providerClient = {
            testConnection: jest.fn(async () => ({ model: 'deepseek-chat', usage: null })),
            streamChat: jest.fn(async ({ onDelta }) => {
                onDelta('流式');
                onDelta('回答');
                return {
                    content: '流式回答',
                    usage: { promptTokens: 4, completionTokens: 3, totalTokens: 7, status: 'exact' },
                };
            }),
        };
        deferredCallbacks = [];
        service = new AIAssistantService({
            database,
            providerClient,
            secretStore: {
                protectApiKey: jest.fn(() => 'safe:v1:dGVzdA=='),
                revealApiKey: jest.fn(() => 'plain-key-in-main-only'),
            },
            requestIdFactory: () => 'request-1',
            defer: (callback) => deferredCallbacks.push(callback),
        });
        sender = {
            id: 42,
            send: jest.fn(),
            isDestroyed: jest.fn(() => false),
        };
        await service.initialize();
    });

    afterEach(async () => {
        await service?.close();
        await fs.promises.rm(tempDirectory, { recursive: true, force: true });
    });

    async function configureAndCreateConversation() {
        await service.acceptPrivacy({ accepted: true });
        await service.saveProvider({
            code: 'volcengine',
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
            endpoints: ['ep-test'],
            activeEndpoint: 'ep-test',
            apiKey: 'secret-key',
        });
        return service.createConversation({ agentCode: 'special_ed_teacher' });
    }

    test('blocks the first outbound message until privacy is explicitly accepted', async () => {
        const conversation = await service.createConversation({ agentCode: 'special_ed_teacher' });

        await expect(service.startChat({
            conversationId: conversation.id,
            content: '不应发送',
        }, sender)).rejects.toMatchObject({ kind: 'privacy_required' });

        expect(providerClient.streamChat).not.toHaveBeenCalled();
        expect(database.listMessages('local-os-profile', conversation.id)).toEqual([]);
    });

    test('streams deltas by request and persists the final message before done', async () => {
        const conversation = await configureAndCreateConversation();
        const started = await service.startChat({
            conversationId: conversation.id,
            content: '请回答',
        }, sender);
        const completion = service.activeRequests.get(started.requestId).completionPromise;

        deferredCallbacks.shift()();
        await completion;

        expect(sender.send).toHaveBeenNthCalledWith(1, 'ai:chat:delta', expect.objectContaining({
            requestId: 'request-1',
            conversationId: conversation.id,
            delta: '流式',
        }));
        expect(sender.send).toHaveBeenCalledWith('ai:chat:done', expect.objectContaining({
            requestId: 'request-1',
            message: expect.objectContaining({ content: '流式回答', status: 'complete' }),
            usage: expect.objectContaining({ totalTokens: 7, requestCount: 1 }),
        }));
        expect(database.listMessages('local-os-profile', conversation.id)).toEqual([
            expect.objectContaining({ role: 'user', content: '请回答' }),
            expect.objectContaining({ role: 'assistant', content: '流式回答', totalTokens: 7 }),
        ]);
    });

    test('applies an enabled hard token limit before creating messages', async () => {
        const conversation = await configureAndCreateConversation();
        await service.updateBudget({ monthlyTokenLimit: 0, hardLimitEnabled: true });

        await expect(service.startChat({
            conversationId: conversation.id,
            content: '不应发送',
        }, sender)).rejects.toMatchObject({ kind: 'budget_exceeded' });

        expect(database.listMessages('local-os-profile', conversation.id)).toEqual([]);
    });

    test('only lets the originating sender cancel a request and preserves partial text', async () => {
        providerClient.streamChat.mockImplementation(({ signal, onDelta }) => new Promise((_resolve, reject) => {
            onDelta('部分内容');
            signal.addEventListener('abort', () => {
                reject(new AIProviderError('cancelled', '请求已停止。'));
            }, { once: true });
        }));
        const conversation = await configureAndCreateConversation();
        const started = await service.startChat({
            conversationId: conversation.id,
            content: '开始',
        }, sender);
        const completion = service.activeRequests.get(started.requestId).completionPromise;
        deferredCallbacks.shift()();
        await Promise.resolve();

        expect(service.cancelChat({
            requestId: started.requestId,
            conversationId: conversation.id,
        }, 999)).toBe(false);
        expect(service.cancelChat({
            requestId: started.requestId,
            conversationId: conversation.id,
        }, sender.id)).toBe(true);
        await completion;

        expect(sender.send).toHaveBeenCalledWith('ai:chat:error', expect.objectContaining({
            error: { kind: 'cancelled', message: '请求已停止。' },
            message: expect.objectContaining({ status: 'cancelled', content: '部分内容' }),
        }));
    });

    test('injects bound knowledge into the system prompt and records provenance', async () => {
        let capturedMessages = null;
        providerClient.streamChat.mockImplementation(async ({ messages, onDelta }) => {
            capturedMessages = messages;
            onDelta('回答');
            return {
                content: '带知识的回答',
                usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, status: 'exact' },
            };
        });

        const conversation = await configureAndCreateConversation();
        const started = await service.startChat({
            conversationId: conversation.id,
            content: '请用专业知识回答',
        }, sender);
        const completion = service.activeRequests.get(started.requestId).completionPromise;
        deferredCallbacks.shift()();
        await completion;

        expect(capturedMessages).not.toBeNull();
        expect(capturedMessages[0].role).toBe('system');
        expect(capturedMessages[0].content).toContain('以下是你掌握的专业技能知识，请据此回答：');
        expect(capturedMessages[0].content).toContain('## 专业技能：');
        expect(capturedMessages[0].content).toContain('special-education-teacher');

        expect(sender.send).toHaveBeenCalledWith('ai:chat:done', expect.objectContaining({
            knowledge: {
                provenance: expect.objectContaining({
                    skillCodes: expect.arrayContaining(['special-education-teacher']),
                    truncated: false,
                }),
                truncated: false,
            },
        }));

        const assistant = database.listMessages('local-os-profile', conversation.id)
            .find((message) => message.role === 'assistant');
        expect(assistant.knowledgeProvenance).toEqual(expect.objectContaining({
            skillCodes: expect.arrayContaining(['special-education-teacher']),
            truncated: false,
        }));
        expect(assistant.knowledgeSnapshot).toContain('## 专业技能：');
    });

    test('runs a bounded tool loop for a tools-enabled agent and audits each call', async () => {
        providerClient.completeChat = jest.fn()
            .mockResolvedValueOnce({
                content: '',
                usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5, status: 'exact' },
                toolCalls: [{
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'search_intervention_apps', arguments: '{"domain":"感知觉统合"}' },
                }],
            })
            .mockResolvedValueOnce({
                content: '已为你找到相关应用。',
                usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28, status: 'exact' },
                toolCalls: [],
            });

        await service.setAgentToolsEnabled({ code: 'special_ed_teacher', enabled: true });
        const conversation = await configureAndCreateConversation();
        const started = await service.startChat({
            conversationId: conversation.id,
            content: '有哪些感觉统合应用',
        }, sender);
        const completion = service.activeRequests.get(started.requestId).completionPromise;
        deferredCallbacks.shift()();
        await completion;

        expect(providerClient.completeChat).toHaveBeenCalledTimes(2);
        expect(providerClient.streamChat).not.toHaveBeenCalled();
        expect(sender.send).toHaveBeenCalledWith('ai:chat:delta', expect.objectContaining({
            delta: '已为你找到相关应用。',
        }));
        expect(sender.send).toHaveBeenCalledWith('ai:chat:tool:step', expect.objectContaining({
            name: 'search_intervention_apps',
            ok: true,
        }));
        expect(sender.send).toHaveBeenCalledWith('ai:chat:done', expect.objectContaining({
            toolSteps: expect.arrayContaining([expect.objectContaining({ name: 'search_intervention_apps' })]),
        }));
        const assistant = database.listMessages('local-os-profile', conversation.id)
            .find((message) => message.role === 'assistant');
        expect(database.listToolCalls(assistant.id)).toEqual([
            expect.objectContaining({ toolName: 'search_intervention_apps', status: 'success' }),
        ]);
    });

    test('blocks image attachments locally when the provider does not support vision', async () => {
        const conversation = await configureAndCreateConversation();
        const messagesBefore = database.listMessages('local-os-profile', conversation.id).length;

        await expect(service.startChat({
            conversationId: conversation.id,
            content: '看看这张课堂图片',
            attachmentIds: ['fake-attachment-id'],
        }, sender)).rejects.toMatchObject({ kind: 'vision_not_supported' });

        // 本地拦截：不应创建任何新消息行，也不应发起网络请求。
        expect(database.listMessages('local-os-profile', conversation.id)).toHaveLength(messagesBefore);
        expect(providerClient.streamChat).not.toHaveBeenCalled();
    });

    test('replaceFromMessageId truncates the prior exchange and regenerates cleanly', async () => {
        const conversation = await configureAndCreateConversation();
        const first = await service.startChat({ conversationId: conversation.id, content: '原问题' }, sender);
        const firstCompletion = service.activeRequests.get(first.requestId).completionPromise;
        deferredCallbacks.shift()();
        await firstCompletion;

        expect(database.listMessages('local-os-profile', conversation.id)).toEqual([
            expect.objectContaining({ role: 'user', content: '原问题' }),
            expect.objectContaining({ role: 'assistant', content: '流式回答' }),
        ]);

        const second = await service.startChat({
            conversationId: conversation.id,
            content: '改后的问题',
            replaceFromMessageId: first.userMessage.id,
        }, sender);
        const secondCompletion = service.activeRequests.get(second.requestId).completionPromise;
        deferredCallbacks.shift()();
        await secondCompletion;

        // 旧问答被截断，只剩新生成的一对；无重复 user 消息。
        expect(database.listMessages('local-os-profile', conversation.id)).toEqual([
            expect.objectContaining({ role: 'user', content: '改后的问题' }),
            expect.objectContaining({ role: 'assistant', content: '流式回答' }),
        ]);
        expect(providerClient.streamChat).toHaveBeenCalledTimes(2);
        expect(sender.send).toHaveBeenCalledWith('ai:chat:done', expect.objectContaining({
            message: expect.objectContaining({ role: 'assistant', content: '流式回答' }),
        }));
    });

    test('replaceFromMessageId leaves history intact when pre-flight fails', async () => {
        const conversation = await configureAndCreateConversation();
        const first = await service.startChat({ conversationId: conversation.id, content: '原问题' }, sender);
        const firstCompletion = service.activeRequests.get(first.requestId).completionPromise;
        deferredCallbacks.shift()();
        await firstCompletion;

        await service.updateBudget({ monthlyTokenLimit: 0, hardLimitEnabled: true });

        await expect(service.startChat({
            conversationId: conversation.id,
            content: '改后的问题',
            replaceFromMessageId: first.userMessage.id,
        }, sender)).rejects.toMatchObject({ kind: 'budget_exceeded' });

        // 预检失败时不得截断历史。
        expect(database.listMessages('local-os-profile', conversation.id)).toEqual([
            expect.objectContaining({ role: 'user', content: '原问题' }),
            expect.objectContaining({ role: 'assistant', content: '流式回答' }),
        ]);
    });

    test('saveProvider persists multiple endpoints, marks the active one, and forwards supportsVision', async () => {
        const provider = await service.saveProvider({
            code: 'volcengine',
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
            endpoints: ['ep-fast', 'ep-pro'],
            activeEndpoint: 'ep-pro',
            supportsVision: true,
        });
        expect(provider.endpoints).toEqual(['ep-fast', 'ep-pro']);
        expect(provider.model).toBe('ep-pro');
        expect(provider.activeEndpoint).toBe('ep-pro');

        const stored = database.getProvider('volcengine');
        expect(stored.endpoints).toEqual(['ep-fast', 'ep-pro']);
        // supportsVision 此前在 service 层被丢弃，这里确保透传到 DB。
        expect(stored.supportsVision).toBe(true);

        // 缺省 active 回退首项；空列表被拒。
        const fallback = await service.saveProvider({
            code: 'volcengine',
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
            endpoints: ['ep-only'],
        });
        expect(fallback.activeEndpoint).toBe('ep-only');
        await expect(service.saveProvider({
            code: 'volcengine',
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
            endpoints: [],
        })).rejects.toMatchObject({ kind: 'invalid_input' });
    });

    test('updatePreference delegates to the database and returns the preference', async () => {
        expect(database.getPreference('local-os-profile').knowledgeSectionVisible).toBe(false);
        const result = await service.updatePreference({ knowledgeSectionVisible: true });
        expect(result.preference.knowledgeSectionVisible).toBe(true);
        expect(database.getPreference('local-os-profile').knowledgeSectionVisible).toBe(true);
    });

    test('bootstrap exposes system feature flags from the injected provider', async () => {
        // 默认（未注入 provider）：三块（智能体管理 / 知识技能 / 本月额度）均隐藏。
        const defaultBootstrap = service.bootstrap();
        expect(defaultBootstrap.features).toEqual({
            agentManagementEnabled: false,
            knowledgeSectionVisible: false,
            budgetSectionVisible: false,
        });
        // 既有字段仍完整，features 是新增键。
        expect(defaultBootstrap.preference).toBeDefined();
        expect(Array.isArray(defaultBootstrap.providers)).toBe(true);

        // 注入系统级开关后：bootstrap 反映三项均为 true。
        const flaggedService = new AIAssistantService({
            database,
            providerClient,
            secretStore: service.secretStore,
            getFeatureFlags: () => ({
                agentManagementEnabled: true,
                knowledgeSectionVisible: true,
                budgetSectionVisible: true,
            }),
        });
        await flaggedService.initialize();

        expect(flaggedService.bootstrap().features).toEqual({
            agentManagementEnabled: true,
            knowledgeSectionVisible: true,
            budgetSectionVisible: true,
        });
    });
});
