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
            code: 'deepseek',
            baseUrl: 'https://api.deepseek.com',
            model: 'deepseek-chat',
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
});
