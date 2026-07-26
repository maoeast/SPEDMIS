const fs = require('fs');
const os = require('os');
const path = require('path');
const initSqlJs = require('sql.js');
const {
    AIAssistantDatabase,
    SCHEMA_VERSION,
    DEFAULT_OWNER_KEY,
} = require('../modules/ai-database');

describe('AI assistant database', () => {
    let tempDirectory;
    let database;
    let idCounter;

    beforeEach(async () => {
        tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spedmis-ai-db-'));
        idCounter = 0;
        database = new AIAssistantDatabase({
            dbPath: path.join(tempDirectory, 'ai-assistant.db'),
            idFactory: () => `id-${String(++idCounter).padStart(3, '0')}`,
        });
        await database.initialize();
    });

    afterEach(async () => {
        await database?.close();
        await fs.promises.rm(tempDirectory, { recursive: true, force: true });
    });

    test('creates the schema and synchronizes five agents idempotently', async () => {
        expect(database.getSchemaVersion()).toBe(SCHEMA_VERSION);
        expect(database.listAgents()).toHaveLength(5);
        expect(database.listProviders()).toEqual([
            expect.objectContaining({ code: 'volcengine', hasApiKey: false }),
        ]);
        expect(database.getPreference(DEFAULT_OWNER_KEY).hardLimitEnabled).toBe(true);

        await database.close();
        database = new AIAssistantDatabase({ dbPath: path.join(tempDirectory, 'ai-assistant.db') });
        await database.initialize();

        expect(database.listAgents()).toHaveLength(5);
        expect(database.getSchemaVersion()).toBe(SCHEMA_VERSION);
    });

    test('enables the hard limit once when migrating schema v1 and preserves later opt-out', async () => {
        const dbPath = path.join(tempDirectory, 'ai-assistant.db');
        await database.close();

        const SQL = await initSqlJs();
        const legacyDatabase = new SQL.Database(await fs.promises.readFile(dbPath));
        legacyDatabase.run("UPDATE ai_schema_meta SET value = '1' WHERE key = 'schema_version'");
        legacyDatabase.run('UPDATE ai_preference SET hard_limit_enabled = 0');
        await fs.promises.writeFile(dbPath, Buffer.from(legacyDatabase.export()));
        legacyDatabase.close();

        database = new AIAssistantDatabase({ dbPath });
        await database.initialize();
        expect(database.getSchemaVersion()).toBe(SCHEMA_VERSION);
        expect(database.getPreference(DEFAULT_OWNER_KEY).hardLimitEnabled).toBe(true);

        await database.updateBudget(DEFAULT_OWNER_KEY, 10000000, false);
        await database.close();
        database = new AIAssistantDatabase({ dbPath });
        await database.initialize();
        expect(database.getPreference(DEFAULT_OWNER_KEY).hardLimitEnabled).toBe(false);
    });

    test('migrates schema v2 to v3, syncing knowledge skills and preserving conversations', async () => {
        const conversation = await database.createConversation(DEFAULT_OWNER_KEY, 'special_ed_teacher');
        await database.close();

        const dbPath = path.join(tempDirectory, 'ai-assistant.db');
        const SQL = await initSqlJs();
        const legacyDatabase = new SQL.Database(await fs.promises.readFile(dbPath));
        legacyDatabase.run("UPDATE ai_schema_meta SET value = '2' WHERE key = 'schema_version'");
        await fs.promises.writeFile(dbPath, Buffer.from(legacyDatabase.export()));
        legacyDatabase.close();

        database = new AIAssistantDatabase({ dbPath });
        await database.initialize();

        expect(database.getSchemaVersion()).toBe(SCHEMA_VERSION);
        expect(database.listKnowledgeSkills()).toHaveLength(7);
        expect(database.getKnowledgeSummaryForBootstrap().totalReferences).toBe(14);
        expect(database.listConversations(DEFAULT_OWNER_KEY).some((c) => c.id === conversation.id)).toBe(true);
        for (const agent of database.listAgents()) {
            expect(agent.sourceType).toBe('builtin');
        }
    });

    test('adds missing columns idempotently via _addColumnIfMissing', () => {
        database._execute('CREATE TABLE _migration_probe (id TEXT)');
        database._addColumnIfMissing('_migration_probe', 'flag', 'INTEGER NOT NULL DEFAULT 0');
        const columns = database._query('PRAGMA table_info(_migration_probe)').map((row) => row.name);
        expect(columns).toContain('flag');
        expect(() => database._addColumnIfMissing('_migration_probe', 'flag', 'INTEGER NOT NULL DEFAULT 0')).not.toThrow();
    });

    test('syncs knowledge skills with version-gated idempotent upgrades', async () => {
        expect(database.listKnowledgeSkills()).toHaveLength(7);
        const before = database._queryOne("SELECT updated_at FROM ai_skill WHERE code = 'speech-therapist'").updated_at;

        database._syncSkills();
        const sameVersion = database._queryOne(
            "SELECT updated_at, content_version FROM ai_skill WHERE code = 'speech-therapist'"
        );
        expect(sameVersion.updated_at).toBe(before);
        expect(sameVersion.content_version).toBe('2.0.0');

        database._execute("UPDATE ai_skill SET content_version = '0.0.1' WHERE code = 'speech-therapist'");
        database._syncSkills();
        const upgraded = database._queryOne(
            "SELECT content_version, updated_at FROM ai_skill WHERE code = 'speech-therapist'"
        );
        expect(upgraded.content_version).toBe('2.0.0');
        expect(upgraded.updated_at).not.toBe(before);
    });

    test('never overwrites a user-customized skill during version-gated sync', async () => {
        database._execute(
            "UPDATE ai_skill SET source_type = 'custom', knowledge_payload = ? WHERE code = 'speech-therapist'",
            [JSON.stringify({ body: '用户自定义正文', references: [], metadata: {} })]
        );
        database._execute("UPDATE ai_skill SET content_version = '0.0.1' WHERE code = 'speech-therapist'");

        database._syncSkills();

        const row = database._queryOne(
            "SELECT knowledge_payload, source_type FROM ai_skill WHERE code = 'speech-therapist'"
        );
        expect(row.source_type).toBe('custom');
        expect(JSON.parse(row.knowledge_payload).body).toBe('用户自定义正文');
    });

    test('seeds agent skill bindings insert-only so user tweaks survive re-sync', async () => {
        const before = database.getEnabledAgentKnowledgeBindings('special_ed_teacher');
        expect(before.map((binding) => binding.skillCode)).toEqual([
            'special-education-teacher',
            'inclusive-training-adaptation',
            'montessori-teacher',
        ]);
        // 用户微调：把第一条绑定的引用改为空（仅正文）。
        database._execute(
            `UPDATE ai_agent_skill SET config = ?
             WHERE agent_code = 'special_ed_teacher' AND skill_code = 'special-education-teacher'`,
            [JSON.stringify({ referenceIds: [] })]
        );
        // 重新同步应 ON CONFLICT DO NOTHING，不覆盖用户微调。
        database._syncAgentSkills();

        const after = database.getEnabledAgentKnowledgeBindings('special_ed_teacher');
        const tweaked = after.find((binding) => binding.skillCode === 'special-education-teacher');
        expect(tweaked.referenceIds).toEqual([]);
        const montessori = after.find((binding) => binding.skillCode === 'montessori-teacher');
        expect(montessori.referenceIds).toEqual([
            'references/prepared-environment-local',
            'references/observation-and-presentation',
        ]);
    });

    test('records knowledge snapshot and provenance on assistant messages only', async () => {
        const conversation = await database.createConversation(DEFAULT_OWNER_KEY, 'special_ed_teacher');
        const pair = await database.createMessagePair(DEFAULT_OWNER_KEY, conversation.id, '问题');
        const provenance = {
            skillCodes: ['special-education-teacher'],
            referenceIds: ['references/domestic-school-workflow'],
            truncated: false,
            originalChars: 100,
            injectedChars: 100,
            charCap: 80000,
        };
        const completed = await database.completeAssistantMessage(
            DEFAULT_OWNER_KEY,
            conversation.id,
            pair.assistantMessage.id,
            '回答',
            { promptTokens: 4, completionTokens: 2, totalTokens: 6, status: 'exact' },
            '知识快照正文',
            provenance
        );
        expect(completed.knowledgeSnapshot).toBe('知识快照正文');
        expect(completed.knowledgeProvenance).toEqual(provenance);

        const messages = database.listMessages(DEFAULT_OWNER_KEY, conversation.id);
        const user = messages.find((message) => message.role === 'user');
        const assistant = messages.find((message) => message.role === 'assistant');
        expect(user.knowledgeSnapshot).toBeNull();
        expect(user.knowledgeProvenance).toBeNull();
        expect(assistant.knowledgeSnapshot).toBe('知识快照正文');
        expect(assistant.knowledgeProvenance).toEqual(provenance);

        const pair2 = await database.createMessagePair(DEFAULT_OWNER_KEY, conversation.id, '第二个问题');
        const noKnowledge = await database.completeAssistantMessage(
            DEFAULT_OWNER_KEY,
            conversation.id,
            pair2.assistantMessage.id,
            '无知识回答',
            { promptTokens: 1, completionTokens: 1, totalTokens: 2, status: 'exact' },
            '',
            null
        );
        expect(noKnowledge.knowledgeSnapshot).toBeNull();
        expect(noKnowledge.knowledgeProvenance).toBeNull();
    });

    test('migrates schema v3 to v4 adding tools_enabled and supports_vision columns', async () => {
        const dbPath = path.join(tempDirectory, 'ai-assistant.db');
        await database.close();
        const SQL = await initSqlJs();
        const legacy = new SQL.Database(await fs.promises.readFile(dbPath));
        legacy.run("UPDATE ai_schema_meta SET value = '3' WHERE key = 'schema_version'");
        await fs.promises.writeFile(dbPath, Buffer.from(legacy.export()));
        legacy.close();

        database = new AIAssistantDatabase({ dbPath });
        await database.initialize();
        expect(database.getSchemaVersion()).toBe(SCHEMA_VERSION);
        const agentCols = database._query('PRAGMA table_info(ai_agent)').map((row) => row.name);
        const providerCols = database._query('PRAGMA table_info(ai_provider)').map((row) => row.name);
        expect(agentCols).toContain('tools_enabled');
        expect(providerCols).toContain('supports_vision');
        expect(database._query("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_tool_call'")).toHaveLength(1);
        expect(database.getAgentByCode('special_ed_teacher').toolsEnabled).toBe(false);
    });

    test('setAgentToolsEnabled flips, survives reopen and builtin re-sync, rejects unknown agents', async () => {
        await database.setAgentToolsEnabled('special_ed_teacher', true);
        expect(database.getAgentByCode('special_ed_teacher').toolsEnabled).toBe(true);

        const dbPath = path.join(tempDirectory, 'ai-assistant.db');
        await database.close();
        database = new AIAssistantDatabase({ dbPath });
        await database.initialize();
        expect(database.getAgentByCode('special_ed_teacher').toolsEnabled).toBe(true);
        database._syncAgents();
        expect(database.getAgentByCode('special_ed_teacher').toolsEnabled).toBe(true);

        await expect(database.setAgentToolsEnabled('does-not-exist', true)).rejects.toMatchObject({ kind: 'agent_not_found' });
    });

    test('records and lists tool-call audit rows without raw result content', async () => {
        const conversation = await database.createConversation(DEFAULT_OWNER_KEY, 'special_ed_teacher');
        await database.recordToolCall({
            conversationId: conversation.id,
            messageId: 'msg-audit',
            toolName: 'search_intervention_apps',
            toolCallId: 'call_1',
            arguments: '{"domain":"感知觉统合"}',
            resultSize: 1234,
            status: 'success',
            round: 0,
        });
        const calls = database.listToolCalls('msg-audit');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ toolName: 'search_intervention_apps', status: 'success', resultSize: 1234 });
        expect(calls[0]).not.toHaveProperty('content');
        expect(calls[0]).not.toHaveProperty('result');
    });

    test('creates and links attachments, and persists supports_vision on the provider', async () => {
        const providerBefore = database.getProvider('volcengine');
        expect(providerBefore.supportsVision).toBe(false);
        await database.saveProvider({
            ownerKey: DEFAULT_OWNER_KEY,
            code: 'volcengine',
            baseUrl: providerBefore.baseUrl,
            model: 'ep-test',
            endpointsJson: JSON.stringify(['ep-test']),
            supportsVision: true,
        });
        expect(database.getProvider('volcengine').supportsVision).toBe(true);

        const conversation = await database.createConversation(DEFAULT_OWNER_KEY, 'special_ed_teacher');
        const attachment = await database.createAttachment({
            conversationId: conversation.id,
            fileName: 'scene.png',
            relativePath: `${conversation.id}/1-scene.png`,
            mimeType: 'image/png',
            sizeBytes: 2048,
            sha256: 'abc123',
            width: 1280,
            height: 720,
        });
        expect(attachment.status).toBe('pending');
        expect(attachment.messageId).toBeNull();

        await database.linkAttachmentsToMessage('msg-att', [attachment.id], conversation.id);
        const linked = database.listAttachmentsForMessage('msg-att');
        expect(linked).toHaveLength(1);
        expect(linked[0]).toMatchObject({ status: 'attached', messageId: 'msg-att' });

        expect(database.listAttachments(conversation.id)).toHaveLength(1);
        expect(database.listAttachmentPaths(conversation.id)).toHaveLength(1);

        await database.deleteAttachment(attachment.id);
        expect(database.listAttachments(conversation.id)).toHaveLength(0);
    });

    test('deleteMessagesFrom truncates from a user anchor, orphaning its attachments and clearing tool calls', async () => {
        const conversation = await database.createConversation(DEFAULT_OWNER_KEY, 'special_ed_teacher');
        const first = await database.createMessagePair(DEFAULT_OWNER_KEY, conversation.id, '第一个问题');
        const second = await database.createMessagePair(DEFAULT_OWNER_KEY, conversation.id, '第二个问题');

        const attachment = await database.createAttachment({
            conversationId: conversation.id,
            fileName: 'pic.png',
            relativePath: `${conversation.id}/1-pic.png`,
            mimeType: 'image/png',
            sizeBytes: 1024,
            sha256: 'deadbeef',
            width: 10,
            height: 10,
        });
        await database.linkAttachmentsToMessage(first.userMessage.id, [attachment.id], conversation.id);
        await database.recordToolCall({
            conversationId: conversation.id,
            messageId: first.assistantMessage.id,
            toolName: 'search_intervention_apps',
            toolCallId: 'call_x',
            arguments: '{}',
            resultSize: 10,
            status: 'success',
            round: 0,
        });

        // 从第二条 user 消息截断：只保留第一对。
        const orphans = await database.deleteMessagesFrom(DEFAULT_OWNER_KEY, conversation.id, second.userMessage.id);
        expect(orphans).toEqual([]);
        const afterFirst = database.listMessages(DEFAULT_OWNER_KEY, conversation.id).map((m) => m.id);
        expect(afterFirst).toEqual([first.userMessage.id, first.assistantMessage.id]);

        // 从第一条 user 消息截断：清空，第一对的附件变 orphaned 并返回路径，工具审计被清。
        const orphanPaths = await database.deleteMessagesFrom(DEFAULT_OWNER_KEY, conversation.id, first.userMessage.id);
        expect(orphanPaths).toEqual([{ id: attachment.id, relativePath: `${conversation.id}/1-pic.png` }]);
        expect(database.listMessages(DEFAULT_OWNER_KEY, conversation.id)).toHaveLength(0);
        expect(database.listToolCalls(first.assistantMessage.id)).toHaveLength(0);
        const orphaned = database.listAttachments(conversation.id);
        // listAttachments 过滤 status='deleted'，但 orphaned 仍可见且与消息脱钩。
        expect(orphaned.find((item) => item.id === attachment.id)).toMatchObject({ status: 'orphaned', messageId: null });
    });

    test('deleteMessagesFrom guards ownership, role and existence', async () => {
        const conversation = await database.createConversation(DEFAULT_OWNER_KEY, 'special_ed_teacher');
        const pair = await database.createMessagePair(DEFAULT_OWNER_KEY, conversation.id, '问题');

        await expect(database.deleteMessagesFrom('another-owner', conversation.id, pair.userMessage.id))
            .rejects.toMatchObject({ kind: 'conversation_not_found' });
        // 另一 owner 被拒后，原消息仍在。
        expect(database.listMessages(DEFAULT_OWNER_KEY, conversation.id)).toHaveLength(2);

        await expect(database.deleteMessagesFrom(DEFAULT_OWNER_KEY, conversation.id, pair.assistantMessage.id))
            .rejects.toMatchObject({ kind: 'invalid_input' });
        await expect(database.deleteMessagesFrom(DEFAULT_OWNER_KEY, conversation.id, 'does-not-exist'))
            .rejects.toMatchObject({ kind: 'message_not_found' });
    });

    test('persists conversations, message status and exact monthly usage across reopen', async () => {
        const conversation = await database.createConversation(
            DEFAULT_OWNER_KEY,
            'special_ed_teacher'
        );
        const pair = await database.createMessagePair(DEFAULT_OWNER_KEY, conversation.id, '测试问题');
        await database.completeAssistantMessage(
            DEFAULT_OWNER_KEY,
            conversation.id,
            pair.assistantMessage.id,
            '测试回答',
            { promptTokens: 8, completionTokens: 5, totalTokens: 13, status: 'exact' }
        );
        await database.close();

        database = new AIAssistantDatabase({ dbPath: path.join(tempDirectory, 'ai-assistant.db') });
        await database.initialize();

        expect(database.listMessages(DEFAULT_OWNER_KEY, conversation.id)).toEqual([
            expect.objectContaining({ role: 'user', content: '测试问题', status: 'complete' }),
            expect.objectContaining({
                role: 'assistant',
                content: '测试回答',
                status: 'complete',
                usageStatus: 'exact',
                totalTokens: 13,
            }),
        ]);
        expect(database.getMonthlyUsage(DEFAULT_OWNER_KEY)).toMatchObject({
            promptTokens: 8,
            completionTokens: 5,
            totalTokens: 13,
            requestCount: 1,
        });
    });

    test('keeps unknown usage explicit while incrementing request count', async () => {
        const conversation = await database.createConversation(
            DEFAULT_OWNER_KEY,
            'special_ed_teacher'
        );
        const pair = await database.createMessagePair(DEFAULT_OWNER_KEY, conversation.id, '测试问题');
        const message = await database.completeAssistantMessage(
            DEFAULT_OWNER_KEY,
            conversation.id,
            pair.assistantMessage.id,
            '没有 usage 的回答',
            { promptTokens: 0, completionTokens: 0, totalTokens: 0, status: 'unknown' }
        );

        expect(message).toMatchObject({ usageStatus: 'unknown', totalTokens: 0 });
        expect(database.getMonthlyUsage(DEFAULT_OWNER_KEY)).toMatchObject({
            totalTokens: 0,
            requestCount: 1,
        });
    });

    test('isolates owners and deletes conversations with their messages transactionally', async () => {
        const localConversation = await database.createConversation(
            DEFAULT_OWNER_KEY,
            'special_ed_teacher'
        );
        await database.createMessagePair(DEFAULT_OWNER_KEY, localConversation.id, 'local');
        const otherConversation = await database.createConversation(
            'another-owner',
            'special_ed_teacher'
        );
        await database.createMessagePair('another-owner', otherConversation.id, 'other');

        expect(database.listConversations(DEFAULT_OWNER_KEY).map((item) => item.id)).toEqual([
            localConversation.id,
        ]);
        expect(database.getConversation(DEFAULT_OWNER_KEY, otherConversation.id)).toBeNull();
        expect(await database.deleteConversation(DEFAULT_OWNER_KEY, otherConversation.id)).toBe(false);
        expect(await database.deleteConversation('another-owner', otherConversation.id)).toBe(true);
        expect(() => database.listMessages('another-owner', otherConversation.id)).toThrow(
            '未找到指定的会话'
        );
    });

    test('stores versioned privacy acknowledgement and budget preferences per owner', async () => {
        await database.acceptPrivacy(DEFAULT_OWNER_KEY, 'notice-v1');
        await database.updateBudget(DEFAULT_OWNER_KEY, 1234, true);

        expect(database.getPreference(DEFAULT_OWNER_KEY)).toMatchObject({
            privacyVersion: 'notice-v1',
            privacyAcceptedAt: expect.any(String),
            monthlyTokenLimit: 1234,
            hardLimitEnabled: true,
        });
        expect(database.getPreference('another-owner')).toMatchObject({
            privacyVersion: null,
            monthlyTokenLimit: 10000000,
            hardLimitEnabled: true,
        });
    });

    test('migrates schema v4 to v5 adding endpoints_json and knowledge_section_visible columns', async () => {
        const dbPath = path.join(tempDirectory, 'ai-assistant.db');
        await database.close();
        const SQL = await initSqlJs();
        const legacy = new SQL.Database(await fs.promises.readFile(dbPath));
        legacy.run("UPDATE ai_schema_meta SET value = '4' WHERE key = 'schema_version'");
        await fs.promises.writeFile(dbPath, Buffer.from(legacy.export()));
        legacy.close();

        database = new AIAssistantDatabase({ dbPath });
        await database.initialize();
        expect(database.getSchemaVersion()).toBe(SCHEMA_VERSION);
        const providerCols = database._query('PRAGMA table_info(ai_provider)').map((row) => row.name);
        const preferenceCols = database._query('PRAGMA table_info(ai_preference)').map((row) => row.name);
        expect(providerCols).toContain('endpoints_json');
        expect(preferenceCols).toContain('knowledge_section_visible');
        // DeepSeek 已下线：迁移后仅剩火山方舟；其 model 为空故 endpoints 为空列表。
        expect(database.getProvider('deepseek')).toBeNull();
        const volcengine = database.getProvider('volcengine');
        expect(volcengine.endpoints).toEqual([]);
        expect(volcengine.activeEndpoint).toBe('');
        // 新偏好位默认隐藏，默认 provider 为火山方舟。
        expect(database.getPreference(DEFAULT_OWNER_KEY).knowledgeSectionVisible).toBe(false);
        expect(database.getPreference(DEFAULT_OWNER_KEY).currentProviderCode).toBe('volcengine');
    });

    test('saveProvider persists endpoints list and treats model as the active endpoint', async () => {
        await database.saveProvider({
            ownerKey: DEFAULT_OWNER_KEY,
            code: 'volcengine',
            baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
            model: 'ep-pro',
            supportsVision: false,
            endpointsJson: JSON.stringify(['ep-fast', 'ep-pro']),
        });
        const provider = database.getProvider('volcengine');
        expect(provider.endpoints).toEqual(['ep-fast', 'ep-pro']);
        expect(provider.model).toBe('ep-pro');
        expect(provider.activeEndpoint).toBe('ep-pro');
    });

    test('updatePreference toggles the knowledge section visibility per owner and ignores unknown keys', async () => {
        expect(database.getPreference(DEFAULT_OWNER_KEY).knowledgeSectionVisible).toBe(false);
        const updated = await database.updatePreference(DEFAULT_OWNER_KEY, { knowledgeSectionVisible: true });
        expect(updated.knowledgeSectionVisible).toBe(true);
        expect(database.getPreference(DEFAULT_OWNER_KEY).knowledgeSectionVisible).toBe(true);

        // 未知键被忽略，不影响已持久化的值。
        const noop = await database.updatePreference(DEFAULT_OWNER_KEY, { unknownFlag: true });
        expect(noop.knowledgeSectionVisible).toBe(true);

        // owner 隔离：另一 owner 默认隐藏。
        expect(database.getPreference('another-owner').knowledgeSectionVisible).toBe(false);
    });
});
