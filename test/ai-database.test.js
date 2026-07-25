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
            expect.objectContaining({ code: 'deepseek', hasApiKey: false }),
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
        const providerBefore = database.getProvider('deepseek');
        expect(providerBefore.supportsVision).toBe(false);
        await database.saveProvider({
            ownerKey: DEFAULT_OWNER_KEY,
            code: 'deepseek',
            baseUrl: providerBefore.baseUrl,
            model: 'deepseek-chat',
            supportsVision: true,
        });
        expect(database.getProvider('deepseek').supportsVision).toBe(true);

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
});
