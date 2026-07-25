describe('AI preload contract', () => {
    let exposeInMainWorld;
    let ipcInvoke;
    let ipcOn;
    let ipcRemoveListener;

    beforeEach(() => {
        jest.resetModules();
        exposeInMainWorld = jest.fn();
        ipcInvoke = jest.fn().mockResolvedValue({ success: true, data: {} });
        ipcOn = jest.fn();
        ipcRemoveListener = jest.fn();

        jest.doMock('electron', () => ({
            contextBridge: { exposeInMainWorld },
            ipcRenderer: {
                invoke: ipcInvoke,
                on: ipcOn,
                removeListener: ipcRemoveListener,
            },
        }));
    });

    afterEach(() => {
        jest.dontMock('electron');
    });

    function getAPI() {
        require('../ai-preload');
        return exposeInMainWorld.mock.calls.find(([name]) => name === 'aiAPI')?.[1];
    }

    test('should expose only the semantic AI methods and map them to fixed channels', async () => {
        const aiAPI = getAPI();

        expect(aiAPI).toBeDefined();
        expect(Object.isFrozen(aiAPI)).toBe(true);
        expect(Object.keys(aiAPI)).toEqual(expect.arrayContaining([
            'bootstrap',
            'saveProvider',
            'listConversations',
            'startChat',
            'cancelChat',
            'acceptPrivacy',
            'setAgentToolsEnabled',
            'uploadAttachment',
            'listAttachments',
            'deleteAttachment',
            'readAttachmentDataUrl',
            'onChatDelta',
            'onChatDone',
            'onChatError',
            'onChatToolStep',
        ]));
        expect(aiAPI.execute).toBeUndefined();

        await aiAPI.bootstrap();
        await aiAPI.saveProvider({ code: 'deepseek' });
        await aiAPI.startChat({ conversationId: 'conversation-1', content: 'hello' });
        await aiAPI.cancelChat('request-1', 'conversation-1');
        await aiAPI.setAgentToolsEnabled({ code: 'special_ed_teacher', enabled: true });

        expect(ipcInvoke).toHaveBeenCalledWith('ai:bootstrap');
        expect(ipcInvoke).toHaveBeenCalledWith('ai:provider:save', { code: 'deepseek' });
        expect(ipcInvoke).toHaveBeenCalledWith('ai:agent:setToolsEnabled', { code: 'special_ed_teacher', enabled: true });
        expect(ipcInvoke).toHaveBeenCalledWith('ai:chat:start', { conversationId: 'conversation-1', content: 'hello' });
        expect(ipcInvoke).toHaveBeenCalledWith('ai:chat:cancel', {
            requestId: 'request-1',
            conversationId: 'conversation-1',
        });
    });

    test('should return a narrow unsubscribe function for stream listeners', () => {
        const aiAPI = getAPI();
        const callback = jest.fn();
        const unsubscribe = aiAPI.onChatDelta(callback);
        const listener = ipcOn.mock.calls[0][1];

        listener(null, { requestId: 'request-1', delta: '片段' });
        expect(callback).toHaveBeenCalledWith({ requestId: 'request-1', delta: '片段' });

        unsubscribe();
        expect(ipcRemoveListener).toHaveBeenCalledWith('ai:chat:delta', listener);
    });
});
