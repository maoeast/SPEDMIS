const { toPublicAIError, AIServiceError } = require('./ai-service');

const AI_CHANNELS = Object.freeze({
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
    chatToolStep: 'ai:chat:tool:step',
    privacyAccept: 'ai:privacy:accept',
    budgetUpdate: 'ai:budget:update',
    externalOpen: 'ai:external:open',
    agentList: 'ai:agent:list',
    agentCreate: 'ai:agent:create',
    agentUpdate: 'ai:agent:update',
    agentDelete: 'ai:agent:delete',
    agentSetEnabled: 'ai:agent:setEnabled',
    agentSetToolsEnabled: 'ai:agent:setToolsEnabled',
    agentSkillList: 'ai:agent:skill:list',
    agentSkillUpdate: 'ai:agent:skill:update',
    agentSkillSetEnabled: 'ai:agent:skill:setEnabled',
    agentSkillDelete: 'ai:agent:skill:delete',
    agentSkillReset: 'ai:agent:skill:reset',
    attachmentUpload: 'ai:attachment:upload',
    attachmentList: 'ai:attachment:list',
    attachmentRemove: 'ai:attachment:remove',
    attachmentReadDataUrl: 'ai:attachment:readDataUrl',
});

function assertAIWindowSender(event, getAIWindow) {
    const aiWindow = getAIWindow();
    if (
        !aiWindow
        || aiWindow.isDestroyed?.()
        || !event?.sender
        || aiWindow.webContents !== event.sender
        || (event.senderFrame && event.sender.mainFrame && event.senderFrame !== event.sender.mainFrame)
    ) {
        throw new AIServiceError('forbidden', '该请求只能由 AI 工作台发起。');
    }
}

function validateExternalUrl(value) {
    if (typeof value !== 'string' || value.length > 2000) {
        throw new AIServiceError('invalid_input', '外部链接无效。');
    }
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new AIServiceError('invalid_input', '外部链接无效。');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
        throw new AIServiceError('invalid_input', '只允许打开 HTTPS 外部链接。');
    }
    return url.toString();
}

function registerAIIPC({ ipcMain, getAIWindow, getService, shell, logger }) {
    const registeredChannels = [];

    const register = (channel, action) => {
        ipcMain.handle(channel, async (event, payload) => {
            try {
                assertAIWindowSender(event, getAIWindow);
                const service = await getService();
                const data = await action(service, event, payload);
                return { success: true, data };
            } catch (error) {
                const publicError = toPublicAIError(error);
                logger?.warn?.('AI IPC request rejected', {
                    channel,
                    kind: publicError.kind,
                });
                return { success: false, error: publicError };
            }
        });
        registeredChannels.push(channel);
    };

    register(AI_CHANNELS.bootstrap, (service) => service.bootstrap());
    register(AI_CHANNELS.knowledgeList, (service) => service.listKnowledge());
    register(AI_CHANNELS.providerSave, (service, _event, payload) => service.saveProvider(payload));
    register(AI_CHANNELS.providerTest, (service, _event, payload) => service.testProvider(payload?.code));
    register(AI_CHANNELS.providerClear, (service, _event, payload) => service.clearProvider(payload?.code));
    register(AI_CHANNELS.conversationList, (service) => service.listConversations());
    register(AI_CHANNELS.conversationCreate, (service, _event, payload) => service.createConversation(payload));
    register(AI_CHANNELS.conversationRename, (service, _event, payload) => service.renameConversation(payload));
    register(AI_CHANNELS.conversationDelete, (service, _event, payload) => service.deleteConversation(payload));
    register(AI_CHANNELS.messageList, (service, _event, payload) => service.listMessages(payload));
    register(AI_CHANNELS.chatStart, (service, event, payload) => service.startChat(payload, event.sender));
    register(
        AI_CHANNELS.chatCancel,
        (service, event, payload) => service.cancelChat(payload, event.sender.id)
    );
    register(AI_CHANNELS.privacyAccept, (service, _event, payload) => service.acceptPrivacy(payload));
    register(AI_CHANNELS.budgetUpdate, (service, _event, payload) => service.updateBudget(payload));
    register(AI_CHANNELS.externalOpen, async (_service, _event, payload) => {
        const url = validateExternalUrl(payload?.url);
        await shell.openExternal(url);
        return { opened: true };
    });
    register(AI_CHANNELS.agentList, (service) => service.listAgentsForGovernance());
    register(AI_CHANNELS.agentCreate, (service, _event, payload) => service.createCustomAgent(payload));
    register(AI_CHANNELS.agentUpdate, (service, _event, payload) => service.updateCustomAgent(payload));
    register(AI_CHANNELS.agentDelete, (service, _event, payload) => service.deleteCustomAgent(payload));
    register(AI_CHANNELS.agentSetEnabled, (service, _event, payload) => service.setAgentEnabled(payload));
    register(AI_CHANNELS.agentSetToolsEnabled, (service, _event, payload) => service.setAgentToolsEnabled(payload));
    register(AI_CHANNELS.agentSkillList, (service, _event, payload) => service.listAgentSkills(payload));
    register(AI_CHANNELS.agentSkillUpdate, (service, _event, payload) => service.updateAgentSkillBinding(payload));
    register(AI_CHANNELS.agentSkillSetEnabled, (service, _event, payload) => service.setAgentSkillEnabled(payload));
    register(AI_CHANNELS.agentSkillDelete, (service, _event, payload) => service.deleteAgentSkillBinding(payload));
    register(AI_CHANNELS.agentSkillReset, (service, _event, payload) => service.resetBuiltinAgentBindings(payload));
    register(AI_CHANNELS.attachmentUpload, (service, _event, payload) => service.uploadAttachment(payload));
    register(AI_CHANNELS.attachmentList, (service, _event, payload) => service.listAttachments(payload));
    register(AI_CHANNELS.attachmentRemove, (service, _event, payload) => service.deleteAttachment(payload));
    register(AI_CHANNELS.attachmentReadDataUrl, (service, _event, payload) => service.readAttachmentDataUrl(payload));

    return () => {
        if (typeof ipcMain.removeHandler !== 'function') {
            return;
        }
        for (const channel of registeredChannels) {
            ipcMain.removeHandler(channel);
        }
    };
}

module.exports = {
    AI_CHANNELS,
    assertAIWindowSender,
    validateExternalUrl,
    registerAIIPC,
};
