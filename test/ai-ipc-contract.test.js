const { AI_CHANNELS, registerAIIPC } = require('../modules/ai-ipc');

describe('AI IPC contract', () => {
    let handlers;
    let ipcMain;
    let webContents;
    let aiWindow;
    let service;
    let shell;

    beforeEach(() => {
        handlers = new Map();
        ipcMain = {
            handle: jest.fn((channel, handler) => handlers.set(channel, handler)),
            removeHandler: jest.fn((channel) => handlers.delete(channel)),
        };
        webContents = { id: 77 };
        aiWindow = {
            webContents,
            isDestroyed: jest.fn(() => false),
        };
        service = {
            bootstrap: jest.fn(() => ({ agents: [] })),
            listKnowledge: jest.fn(() => ({ skills: [], summary: {} })),
            listAgentsForGovernance: jest.fn(() => []),
            createCustomAgent: jest.fn(),
            updateCustomAgent: jest.fn(),
            deleteCustomAgent: jest.fn(),
            setAgentEnabled: jest.fn(),
            listAgentSkills: jest.fn(),
            updateAgentSkillBinding: jest.fn(),
            setAgentSkillEnabled: jest.fn(),
            deleteAgentSkillBinding: jest.fn(),
            resetBuiltinAgentBindings: jest.fn(),
            saveProvider: jest.fn(),
            testProvider: jest.fn(),
            clearProvider: jest.fn(),
            listConversations: jest.fn(),
            createConversation: jest.fn(),
            renameConversation: jest.fn(),
            deleteConversation: jest.fn(),
            listMessages: jest.fn(),
            startChat: jest.fn(),
            cancelChat: jest.fn(),
            acceptPrivacy: jest.fn(),
            updateBudget: jest.fn(),
        };
        shell = { openExternal: jest.fn(async () => undefined) };
        registerAIIPC({
            ipcMain,
            getAIWindow: () => aiWindow,
            getService: async () => service,
            shell,
        });
    });

    test('registers only the explicit AI request channels', () => {
        expect([...handlers.keys()]).toEqual([
            AI_CHANNELS.bootstrap,
            AI_CHANNELS.knowledgeList,
            AI_CHANNELS.providerSave,
            AI_CHANNELS.providerTest,
            AI_CHANNELS.providerClear,
            AI_CHANNELS.conversationList,
            AI_CHANNELS.conversationCreate,
            AI_CHANNELS.conversationRename,
            AI_CHANNELS.conversationDelete,
            AI_CHANNELS.messageList,
            AI_CHANNELS.chatStart,
            AI_CHANNELS.chatCancel,
            AI_CHANNELS.privacyAccept,
            AI_CHANNELS.budgetUpdate,
            AI_CHANNELS.externalOpen,
            AI_CHANNELS.agentList,
            AI_CHANNELS.agentCreate,
            AI_CHANNELS.agentUpdate,
            AI_CHANNELS.agentDelete,
            AI_CHANNELS.agentSetEnabled,
            AI_CHANNELS.agentSkillList,
            AI_CHANNELS.agentSkillUpdate,
            AI_CHANNELS.agentSkillSetEnabled,
            AI_CHANNELS.agentSkillDelete,
            AI_CHANNELS.agentSkillReset,
        ]);
    });

    test('rejects calls from any sender other than the AI window', async () => {
        const result = await handlers.get(AI_CHANNELS.bootstrap)({ sender: { id: 999 } });

        expect(result).toEqual({
            success: false,
            error: { kind: 'forbidden', message: '该请求只能由 AI 工作台发起。' },
        });
        expect(service.bootstrap).not.toHaveBeenCalled();
    });

    test('returns sanitized data for an authorized AI window request', async () => {
        const result = await handlers.get(AI_CHANNELS.bootstrap)({ sender: webContents });

        expect(result).toEqual({ success: true, data: { agents: [] } });
        expect(service.bootstrap).toHaveBeenCalledTimes(1);
    });

    test('returns the knowledge catalog for an authorized AI window request', async () => {
        const result = await handlers.get(AI_CHANNELS.knowledgeList)({ sender: webContents });

        expect(result).toEqual({ success: true, data: { skills: [], summary: {} } });
        expect(service.listKnowledge).toHaveBeenCalledTimes(1);
    });

    test('passes sender identity into chat start and cancel isolation', async () => {
        const startPayload = { conversationId: 'conversation-1', content: 'hello' };
        const cancelPayload = { conversationId: 'conversation-1', requestId: 'request-1' };
        service.startChat.mockResolvedValue({ requestId: 'request-1' });
        service.cancelChat.mockReturnValue(true);

        await handlers.get(AI_CHANNELS.chatStart)({ sender: webContents }, startPayload);
        await handlers.get(AI_CHANNELS.chatCancel)({ sender: webContents }, cancelPayload);

        expect(service.startChat).toHaveBeenCalledWith(startPayload, webContents);
        expect(service.cancelChat).toHaveBeenCalledWith(cancelPayload, webContents.id);
    });

    test('opens only credential-free HTTPS links', async () => {
        await expect(handlers.get(AI_CHANNELS.externalOpen)(
            { sender: webContents },
            { url: 'https://example.com/path' }
        )).resolves.toEqual({ success: true, data: { opened: true } });
        expect(shell.openExternal).toHaveBeenCalledWith('https://example.com/path');

        await expect(handlers.get(AI_CHANNELS.externalOpen)(
            { sender: webContents },
            { url: 'javascript:alert(1)' }
        )).resolves.toMatchObject({ success: false, error: { kind: 'invalid_input' } });
    });
});
