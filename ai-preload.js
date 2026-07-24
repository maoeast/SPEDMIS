const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = Object.freeze({
    bootstrap: 'ai:bootstrap',
    knowledgeList: 'ai:knowledge:list',
    providerSave: 'ai:provider:save',
    providerTest: 'ai:provider:test',
    providerClear: 'ai:provider:clear',
    conversationList: 'ai:conversation:list',
    conversationCreate: 'ai:conversation:create',
    conversationRename: 'ai:conversation:rename',
    conversationDelete: 'ai:conversation:delete',
    messageList: 'ai:message:list',
    chatStart: 'ai:chat:start',
    chatCancel: 'ai:chat:cancel',
    chatDelta: 'ai:chat:delta',
    chatDone: 'ai:chat:done',
    chatError: 'ai:chat:error',
    privacyAccept: 'ai:privacy:accept',
    budgetUpdate: 'ai:budget:update',
    externalOpen: 'ai:external:open',
    agentList: 'ai:agent:list',
    agentCreate: 'ai:agent:create',
    agentUpdate: 'ai:agent:update',
    agentDelete: 'ai:agent:delete',
    agentSetEnabled: 'ai:agent:setEnabled',
    agentSkillList: 'ai:agent:skill:list',
    agentSkillUpdate: 'ai:agent:skill:update',
    agentSkillSetEnabled: 'ai:agent:skill:setEnabled',
    agentSkillDelete: 'ai:agent:skill:delete',
    agentSkillReset: 'ai:agent:skill:reset',
});

function subscribe(channel, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('A listener callback is required');
    }
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('aiAPI', Object.freeze({
    bootstrap: () => ipcRenderer.invoke(CHANNELS.bootstrap),
    listKnowledge: () => ipcRenderer.invoke(CHANNELS.knowledgeList),
    saveProvider: (payload) => ipcRenderer.invoke(CHANNELS.providerSave, payload),
    testProvider: (code) => ipcRenderer.invoke(CHANNELS.providerTest, { code }),
    clearProvider: (code) => ipcRenderer.invoke(CHANNELS.providerClear, { code }),
    listConversations: () => ipcRenderer.invoke(CHANNELS.conversationList),
    createConversation: (payload) => ipcRenderer.invoke(CHANNELS.conversationCreate, payload),
    renameConversation: (conversationId, title) => ipcRenderer.invoke(
        CHANNELS.conversationRename,
        { conversationId, title }
    ),
    deleteConversation: (conversationId) => ipcRenderer.invoke(
        CHANNELS.conversationDelete,
        { conversationId }
    ),
    listMessages: (payload) => ipcRenderer.invoke(CHANNELS.messageList, payload),
    startChat: (payload) => ipcRenderer.invoke(CHANNELS.chatStart, payload),
    cancelChat: (requestId, conversationId) => ipcRenderer.invoke(
        CHANNELS.chatCancel,
        { requestId, conversationId }
    ),
    acceptPrivacy: () => ipcRenderer.invoke(CHANNELS.privacyAccept, { accepted: true }),
    updateBudget: (payload) => ipcRenderer.invoke(CHANNELS.budgetUpdate, payload),
    openExternal: (url) => ipcRenderer.invoke(CHANNELS.externalOpen, { url }),
    listAgentsForGovernance: () => ipcRenderer.invoke(CHANNELS.agentList),
    createCustomAgent: (payload) => ipcRenderer.invoke(CHANNELS.agentCreate, payload),
    updateCustomAgent: (payload) => ipcRenderer.invoke(CHANNELS.agentUpdate, payload),
    deleteCustomAgent: (payload) => ipcRenderer.invoke(CHANNELS.agentDelete, payload),
    setAgentEnabled: (payload) => ipcRenderer.invoke(CHANNELS.agentSetEnabled, payload),
    listAgentSkills: (payload) => ipcRenderer.invoke(CHANNELS.agentSkillList, payload),
    updateAgentSkillBinding: (payload) => ipcRenderer.invoke(CHANNELS.agentSkillUpdate, payload),
    setAgentSkillEnabled: (payload) => ipcRenderer.invoke(CHANNELS.agentSkillSetEnabled, payload),
    deleteAgentSkillBinding: (payload) => ipcRenderer.invoke(CHANNELS.agentSkillDelete, payload),
    resetBuiltinAgentBindings: (payload) => ipcRenderer.invoke(CHANNELS.agentSkillReset, payload),
    onChatDelta: (callback) => subscribe(CHANNELS.chatDelta, callback),
    onChatDone: (callback) => subscribe(CHANNELS.chatDone, callback),
    onChatError: (callback) => subscribe(CHANNELS.chatError, callback),
}));
