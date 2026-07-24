const fs = require('fs');
const os = require('os');
const path = require('path');
const { AIAssistantDatabase } = require('../modules/ai-database');
const { AIAssistantService } = require('../modules/ai-service');
const { getBuiltinAgents } = require('../modules/ai-agent-catalog');

describe('AI agent governance', () => {
    let tempDirectory;
    let database;
    let service;
    let providerClient;
    let deferredCallbacks;

    beforeEach(async () => {
        tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spedmis-ai-governance-'));
        database = new AIAssistantDatabase({ dbPath: path.join(tempDirectory, 'ai-assistant.db') });
        providerClient = {
            testConnection: jest.fn(async () => ({ model: 'deepseek-chat', usage: null })),
            streamChat: jest.fn(async () => ({
                content: 'ok',
                usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, status: 'exact' },
            })),
        };
        deferredCallbacks = [];
        service = new AIAssistantService({
            database,
            providerClient,
            secretStore: {
                protectApiKey: jest.fn(() => 'safe:v1:dGVzdA=='),
                revealApiKey: jest.fn(() => 'plain-key'),
            },
            requestIdFactory: () => 'request-gov',
            defer: (callback) => deferredCallbacks.push(callback),
        });
        await service.initialize();
    });

    afterEach(async () => {
        await service?.close();
        await fs.promises.rm(tempDirectory, { recursive: true, force: true });
    });

    test('creates a custom agent distinct from builtins and lists it for governance', async () => {
        const created = await service.createCustomAgent({
            code: 'custom-coach',
            name: '我的助手',
            systemPrompt: '你是一个自定义助手。',
        });
        expect(created.sourceType).toBe('custom');
        expect(created.code).toBe('custom-coach');

        const all = service.listAgentsForGovernance();
        expect(all.some((agent) => agent.code === 'custom-coach' && agent.sourceType === 'custom')).toBe(true);
        expect(getBuiltinAgents().some((agent) => agent.code === 'custom-coach')).toBe(false);
    });

    test('rejects reserved builtin codes and invalid code patterns', async () => {
        await expect(service.createCustomAgent({
            code: 'special_ed_teacher',
            name: '占位',
            systemPrompt: 'x',
        })).rejects.toMatchObject({ kind: 'reserved_agent_code' });

        await expect(service.createCustomAgent({
            code: 'Bad Code!',
            name: '占位',
            systemPrompt: 'x',
        })).rejects.toMatchObject({ kind: 'invalid_agent_code' });
    });

    test('updates only custom agents and refuses builtins', async () => {
        await service.createCustomAgent({ code: 'custom-coach', name: '原名', systemPrompt: '提示词' });
        const updated = await service.updateCustomAgent({ code: 'custom-coach', name: '新名' });
        expect(updated.name).toBe('新名');

        await expect(service.updateCustomAgent({ code: 'special_ed_teacher', name: '篡改' }))
            .rejects.toMatchObject({ kind: 'agent_not_editable' });
    });

    test('disabling a builtin removes it from the chat switcher but keeps it for governance', async () => {
        await service.setAgentEnabled({ code: 'special_ed_teacher', enabled: false });

        expect(database.listAgents().some((agent) => agent.code === 'special_ed_teacher')).toBe(false);
        const disabled = service.listAgentsForGovernance().find((agent) => agent.code === 'special_ed_teacher');
        expect(disabled).toBeDefined();
        expect(disabled.enabled).toBe(false);
        expect(disabled.sourceType).toBe('builtin');
    });

    test('a disabled builtin agent stays disabled across database re-init', async () => {
        await service.setAgentEnabled({ code: 'scgp_builtin_wellbeing_support', enabled: false });
        const dbPath = path.join(tempDirectory, 'ai-assistant.db');

        const reopened = new AIAssistantDatabase({ dbPath });
        await reopened.initialize();
        const agent = reopened.listAllAgents().find((item) => item.code === 'scgp_builtin_wellbeing_support');
        expect(agent.enabled).toBe(false);
        await reopened.close();
    });

    test('mounting and unmounting a skill binding works via the service', async () => {
        await service.updateAgentSkillBinding({
            agentCode: 'special_ed_teacher',
            skillCode: 'speech-therapist',
            referenceIds: null,
        });
        expect(service.listAgentSkills({ agentCode: 'special_ed_teacher' })
            .some((binding) => binding.skillCode === 'speech-therapist')).toBe(true);

        await service.deleteAgentSkillBinding({
            agentCode: 'special_ed_teacher',
            skillCode: 'speech-therapist',
        });
        expect(service.listAgentSkills({ agentCode: 'special_ed_teacher' })
            .some((binding) => binding.skillCode === 'speech-therapist')).toBe(false);
    });

    test('resetBuiltinAgentBindings restores the seed bindings for a builtin agent', async () => {
        await service.deleteAgentSkillBinding({
            agentCode: 'special_ed_teacher',
            skillCode: 'special-education-teacher',
        });
        expect(service.listAgentSkills({ agentCode: 'special_ed_teacher' })
            .some((binding) => binding.skillCode === 'special-education-teacher')).toBe(false);

        const restored = await service.resetBuiltinAgentBindings({ agentCode: 'special_ed_teacher' });
        expect(restored.map((binding) => binding.skillCode)).toEqual([
            'special-education-teacher',
            'inclusive-training-adaptation',
            'montessori-teacher',
        ]);
    });

    test('deleteCustomAgent cascades bindings and removes the agent', async () => {
        await service.createCustomAgent({ code: 'custom-coach', name: '临时', systemPrompt: '提示词' });
        await service.updateAgentSkillBinding({
            agentCode: 'custom-coach',
            skillCode: 'montessori-teacher',
            referenceIds: null,
        });
        expect(service.listAgentSkills({ agentCode: 'custom-coach' }).length).toBeGreaterThan(0);

        const result = await service.deleteCustomAgent({ code: 'custom-coach' });
        expect(result.deleted).toBe(true);
        expect(service.listAgentSkills({ agentCode: 'custom-coach' })).toEqual([]);
        expect(service.listAgentsForGovernance().some((agent) => agent.code === 'custom-coach')).toBe(false);
    });

    test('aborts in-flight requests for an agent before refusing deletion when in use', async () => {
        await service.createCustomAgent({ code: 'custom-coach', name: '临时', systemPrompt: '提示词' });
        const conversation = await service.createConversation({ agentCode: 'custom-coach' });
        const controller = new AbortController();
        const abortSpy = jest.spyOn(controller, 'abort');
        service.activeRequests.set('fake-request', {
            requestId: 'fake-request',
            conversationId: conversation.id,
            controller,
            senderId: 7,
        });

        await expect(service.deleteCustomAgent({ code: 'custom-coach' }))
            .rejects.toMatchObject({ kind: 'agent_in_use' });
        expect(abortSpy).toHaveBeenCalled();
    });
});
