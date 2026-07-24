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
        expect(database.getSchemaVersion()).toBe(2);
        expect(database.getPreference(DEFAULT_OWNER_KEY).hardLimitEnabled).toBe(true);

        await database.updateBudget(DEFAULT_OWNER_KEY, 10000000, false);
        await database.close();
        database = new AIAssistantDatabase({ dbPath });
        await database.initialize();
        expect(database.getPreference(DEFAULT_OWNER_KEY).hardLimitEnabled).toBe(false);
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
