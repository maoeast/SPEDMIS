const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const initSqlJs = require('sql.js');
const { getBuiltinAgents } = require('./ai-agent-catalog');
const { PROVIDER_PRESETS } = require('./ai-provider-client');

const SCHEMA_VERSION = 2;
const DEFAULT_OWNER_KEY = 'local-os-profile';
const DEFAULT_MONTHLY_TOKEN_LIMIT = 10000000;
const DEFAULT_CONVERSATION_TITLE = '新对话';

class AIDatabaseError extends Error {
    constructor(kind, message) {
        super(message);
        this.name = 'AIDatabaseError';
        this.kind = kind;
    }
}

function parseJsonArray(value) {
    if (typeof value !== 'string' || !value) {
        return [];
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function monthKey(date = new Date()) {
    return date.toISOString().slice(0, 7);
}

function mapAgentRow(row, includeSystemPrompt = false) {
    if (!row) {
        return null;
    }
    const agent = {
        code: String(row.code),
        name: String(row.name),
        displayName: String(row.display_name),
        avatarText: String(row.avatar_text),
        avatarTone: String(row.avatar_tone),
        tagline: String(row.tagline),
        teacherSupport: String(row.teacher_support),
        expertiseTags: parseJsonArray(row.expertise_tags),
        starterPrompts: parseJsonArray(row.starter_prompts),
        source: String(row.source),
        license: String(row.license),
        contentVersion: String(row.content_version),
        sort: Number(row.sort || 0),
    };
    if (includeSystemPrompt) {
        agent.systemPrompt = String(row.system_prompt);
    }
    return agent;
}

function mapProviderRow(row, includeSecret = false) {
    if (!row) {
        return null;
    }
    const provider = {
        code: String(row.code),
        name: String(row.name),
        baseUrl: String(row.base_url),
        model: String(row.model),
        enabled: Number(row.enabled) === 1,
        hasApiKey: Number(row.has_key) === 1,
        sort: Number(row.sort || 0),
        updatedAt: String(row.updated_at),
    };
    if (includeSecret) {
        provider.apiKeyEncrypted = String(row.api_key_enc || '');
    }
    return provider;
}

function mapConversationRow(row) {
    if (!row) {
        return null;
    }
    return {
        id: String(row.id),
        agentCode: String(row.agent_code),
        agentName: row.agent_name == null ? '' : String(row.agent_name),
        title: String(row.title),
        messageCount: Number(row.message_count || 0),
        totalTokens: Number(row.total_tokens || 0),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
}

function mapMessageRow(row) {
    if (!row) {
        return null;
    }
    return {
        id: String(row.id),
        conversationId: String(row.conversation_id),
        role: String(row.role),
        content: String(row.content || ''),
        status: String(row.status),
        promptTokens: Number(row.prompt_tokens || 0),
        completionTokens: Number(row.completion_tokens || 0),
        totalTokens: Number(row.total_tokens || 0),
        usageStatus: String(row.usage_status || 'unknown'),
        errorKind: row.error_kind == null ? null : String(row.error_kind),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
}

class AIAssistantDatabase {
    constructor(options = {}) {
        if (!options.dbPath) {
            throw new Error('dbPath is required');
        }

        this.dbPath = options.dbPath;
        this.initSqlJs = options.initSqlJs || initSqlJs;
        this.fileSystem = options.fileSystem || fs.promises;
        this.idFactory = options.idFactory || randomUUID;
        this.now = options.now || (() => new Date().toISOString());
        this.builtinAgents = options.builtinAgents || getBuiltinAgents();
        this.providerPresets = options.providerPresets || Object.values(PROVIDER_PRESETS);
        this.SQL = options.SQL || null;
        this.db = null;
        this.initialized = false;
        this.closed = false;
        this.dirty = false;
        this.initializePromise = null;
        this.persistChain = Promise.resolve();
        this.tempFileCounter = 0;
    }

    async initialize() {
        if (this.initialized) {
            return this;
        }
        if (this.initializePromise) {
            return this.initializePromise;
        }

        this.initializePromise = this._initialize();
        try {
            await this.initializePromise;
            return this;
        } finally {
            this.initializePromise = null;
        }
    }

    async _initialize() {
        await this.fileSystem.mkdir(path.dirname(this.dbPath), { recursive: true });
        if (!this.SQL) {
            this.SQL = await this.initSqlJs();
        }

        let databaseBytes = null;
        try {
            databaseBytes = await this.fileSystem.readFile(this.dbPath);
        } catch (error) {
            if (error?.code !== 'ENOENT') {
                throw new AIDatabaseError('database_read_failed', '无法读取 AI 助手数据库。');
            }
        }

        try {
            this.db = new this.SQL.Database(databaseBytes || undefined);
            this.db.run('PRAGMA foreign_keys = ON');
            this._transaction(() => {
                this._createSchema();
                this._syncAgents();
                this._syncProviders();
                this._ensurePreference(DEFAULT_OWNER_KEY);
            });
            this.initialized = true;
            this.closed = false;
            this.dirty = true;
            await this.flush();
        } catch (error) {
            this.db?.close?.();
            this.db = null;
            this.initialized = false;
            if (error instanceof AIDatabaseError) {
                throw error;
            }
            throw new AIDatabaseError('database_initialize_failed', 'AI 助手数据库初始化失败。');
        }
    }

    _createSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS ai_schema_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_agent (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                display_name TEXT NOT NULL,
                avatar_text TEXT NOT NULL,
                avatar_tone TEXT NOT NULL,
                tagline TEXT NOT NULL,
                teacher_support TEXT NOT NULL,
                expertise_tags TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                starter_prompts TEXT NOT NULL,
                source TEXT NOT NULL,
                license TEXT NOT NULL,
                content_version TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                sort INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_provider (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                base_url TEXT NOT NULL,
                model TEXT NOT NULL DEFAULT '',
                api_key_enc TEXT NOT NULL DEFAULT '',
                has_key INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                sort INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_conversation (
                id TEXT PRIMARY KEY,
                owner_key TEXT NOT NULL,
                agent_code TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (agent_code) REFERENCES ai_agent(code)
            );

            CREATE TABLE IF NOT EXISTS ai_message (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'error', 'cancelled')),
                prompt_tokens INTEGER NOT NULL DEFAULT 0,
                completion_tokens INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                usage_status TEXT NOT NULL DEFAULT 'unknown' CHECK (usage_status IN ('exact', 'unknown')),
                error_kind TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES ai_conversation(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ai_monthly_usage (
                owner_key TEXT NOT NULL,
                month TEXT NOT NULL,
                prompt_tokens INTEGER NOT NULL DEFAULT 0,
                completion_tokens INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                request_count INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (owner_key, month)
            );

            CREATE TABLE IF NOT EXISTS ai_preference (
                owner_key TEXT PRIMARY KEY,
                privacy_version TEXT,
                privacy_accepted_at TEXT,
                current_provider_code TEXT NOT NULL DEFAULT 'deepseek',
                monthly_token_limit INTEGER NOT NULL DEFAULT 10000000,
                hard_limit_enabled INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (current_provider_code) REFERENCES ai_provider(code)
            );

            CREATE INDEX IF NOT EXISTS idx_ai_conversation_owner_updated
                ON ai_conversation(owner_key, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_ai_message_conversation_created
                ON ai_message(conversation_id, created_at, id);
            CREATE INDEX IF NOT EXISTS idx_ai_monthly_usage_owner_month
                ON ai_monthly_usage(owner_key, month);
        `);

        const schemaVersionRow = this._queryOne('SELECT value FROM ai_schema_meta WHERE key = ?', ['schema_version']);
        const previousSchemaVersion = Number(schemaVersionRow?.value || 0);
        if (previousSchemaVersion > SCHEMA_VERSION) {
            throw new AIDatabaseError('schema_version_unsupported', 'AI 助手数据库版本高于当前应用支持范围。');
        }
        if (previousSchemaVersion > 0 && previousSchemaVersion < 2) {
            this._execute('UPDATE ai_preference SET hard_limit_enabled = 1');
        }

        this._execute(
            `INSERT INTO ai_schema_meta (key, value) VALUES ('schema_version', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [String(SCHEMA_VERSION)]
        );
    }

    _syncAgents() {
        const timestamp = this.now();
        for (const agent of this.builtinAgents) {
            this._execute(
                `INSERT INTO ai_agent (
                    code, name, display_name, avatar_text, avatar_tone, tagline, teacher_support,
                    expertise_tags, system_prompt, starter_prompts, source, license, content_version,
                    enabled, sort, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                ON CONFLICT(code) DO UPDATE SET
                    name = excluded.name,
                    display_name = excluded.display_name,
                    avatar_text = excluded.avatar_text,
                    avatar_tone = excluded.avatar_tone,
                    tagline = excluded.tagline,
                    teacher_support = excluded.teacher_support,
                    expertise_tags = excluded.expertise_tags,
                    system_prompt = excluded.system_prompt,
                    starter_prompts = excluded.starter_prompts,
                    source = excluded.source,
                    license = excluded.license,
                    content_version = excluded.content_version,
                    sort = excluded.sort,
                    updated_at = excluded.updated_at`,
                [
                    agent.code,
                    agent.name,
                    agent.displayName,
                    agent.avatarText,
                    agent.avatarTone,
                    agent.tagline,
                    agent.teacherSupport,
                    JSON.stringify(agent.expertiseTags),
                    agent.systemPrompt,
                    JSON.stringify(agent.starterPrompts),
                    agent.source,
                    agent.license,
                    agent.contentVersion,
                    agent.sort,
                    timestamp,
                    timestamp,
                ]
            );
        }
    }

    _syncProviders() {
        const timestamp = this.now();
        for (const provider of this.providerPresets) {
            this._execute(
                `INSERT INTO ai_provider (
                    code, name, base_url, model, api_key_enc, has_key, enabled, sort, created_at, updated_at
                ) VALUES (?, ?, ?, ?, '', 0, 1, ?, ?, ?)
                ON CONFLICT(code) DO UPDATE SET
                    name = excluded.name,
                    sort = excluded.sort`,
                [
                    provider.code,
                    provider.name,
                    provider.baseUrl,
                    provider.defaultModel || '',
                    provider.sort,
                    timestamp,
                    timestamp,
                ]
            );
        }
    }

    _ensurePreference(ownerKey) {
        this._execute(
            `INSERT OR IGNORE INTO ai_preference (
                owner_key, current_provider_code, monthly_token_limit, hard_limit_enabled, updated_at
             ) VALUES (?, 'deepseek', ?, 1, ?)`,
            [ownerKey, DEFAULT_MONTHLY_TOKEN_LIMIT, this.now()]
        );
    }

    _assertReady() {
        if (!this.initialized || !this.db || this.closed) {
            throw new AIDatabaseError('database_unavailable', 'AI 助手数据库尚未就绪。');
        }
    }

    _execute(sql, params = []) {
        const statement = this.db.prepare(sql);
        try {
            statement.bind(params);
            statement.step();
            return this.db.getRowsModified();
        } finally {
            statement.free();
        }
    }

    _query(sql, params = []) {
        const statement = this.db.prepare(sql);
        const rows = [];
        try {
            statement.bind(params);
            while (statement.step()) {
                rows.push(statement.getAsObject());
            }
        } finally {
            statement.free();
        }
        return rows;
    }

    _queryOne(sql, params = []) {
        return this._query(sql, params)[0] || null;
    }

    _transaction(work) {
        this.db.run('BEGIN TRANSACTION');
        try {
            const result = work();
            this.db.run('COMMIT');
            return result;
        } catch (error) {
            try {
                this.db.run('ROLLBACK');
            } catch {
                // Preserve the original failure.
            }
            throw error;
        }
    }

    async _commitMutation() {
        this.dirty = true;
        await this.flush();
    }

    async flush() {
        this._assertReady();
        const operation = this.persistChain
            .catch(() => undefined)
            .then(async () => {
                if (!this.dirty) {
                    return;
                }

                this.dirty = false;
                const snapshot = Buffer.from(this.db.export());
                const tempPath = `${this.dbPath}.tmp-${process.pid}-${this.tempFileCounter++}`;
                try {
                    await this.fileSystem.writeFile(tempPath, snapshot);
                    await this.fileSystem.rename(tempPath, this.dbPath);
                } catch {
                    this.dirty = true;
                    await this.fileSystem.unlink(tempPath).catch(() => undefined);
                    throw new AIDatabaseError('database_persist_failed', 'AI 助手数据保存失败，请检查磁盘后重试。');
                }
            });
        this.persistChain = operation;
        return operation;
    }

    getSchemaVersion() {
        this._assertReady();
        const row = this._queryOne(`SELECT value FROM ai_schema_meta WHERE key = 'schema_version'`);
        return Number(row?.value || 0);
    }

    listAgents() {
        this._assertReady();
        return this._query('SELECT * FROM ai_agent WHERE enabled = 1 ORDER BY sort ASC, code ASC')
            .map((row) => mapAgentRow(row));
    }

    getAgent(code) {
        this._assertReady();
        return mapAgentRow(this._queryOne('SELECT * FROM ai_agent WHERE code = ? AND enabled = 1', [code]), true);
    }

    listProviders() {
        this._assertReady();
        return this._query('SELECT * FROM ai_provider WHERE enabled = 1 ORDER BY sort ASC, code ASC')
            .map((row) => mapProviderRow(row));
    }

    getProvider(code) {
        this._assertReady();
        return mapProviderRow(this._queryOne('SELECT * FROM ai_provider WHERE code = ? AND enabled = 1', [code]), true);
    }

    async saveProvider({ ownerKey, code, baseUrl, model, apiKeyEncrypted }) {
        this._assertReady();
        const existing = this.getProvider(code);
        if (!existing) {
            throw new AIDatabaseError('provider_not_found', '未找到指定的 Provider。');
        }

        this._transaction(() => {
            if (apiKeyEncrypted !== undefined) {
                this._execute(
                    `UPDATE ai_provider
                     SET base_url = ?, model = ?, api_key_enc = ?, has_key = ?, updated_at = ?
                     WHERE code = ?`,
                    [baseUrl, model, apiKeyEncrypted, apiKeyEncrypted ? 1 : 0, this.now(), code]
                );
            } else {
                this._execute(
                    `UPDATE ai_provider SET base_url = ?, model = ?, updated_at = ? WHERE code = ?`,
                    [baseUrl, model, this.now(), code]
                );
            }
            this._ensurePreference(ownerKey);
            this._execute(
                `UPDATE ai_preference SET current_provider_code = ?, updated_at = ? WHERE owner_key = ?`,
                [code, this.now(), ownerKey]
            );
        });
        await this._commitMutation();
        return this.getProvider(code);
    }

    async clearProviderKey(code) {
        this._assertReady();
        const changed = this._execute(
            `UPDATE ai_provider SET api_key_enc = '', has_key = 0, updated_at = ? WHERE code = ?`,
            [this.now(), code]
        );
        if (!changed) {
            throw new AIDatabaseError('provider_not_found', '未找到指定的 Provider。');
        }
        await this._commitMutation();
        return this.getProvider(code);
    }

    getPreference(ownerKey) {
        this._assertReady();
        const row = this._queryOne('SELECT * FROM ai_preference WHERE owner_key = ?', [ownerKey]);
        if (!row) {
            return {
                ownerKey,
                privacyVersion: null,
                privacyAcceptedAt: null,
                currentProviderCode: 'deepseek',
                monthlyTokenLimit: DEFAULT_MONTHLY_TOKEN_LIMIT,
                hardLimitEnabled: true,
            };
        }
        return {
            ownerKey: String(row.owner_key),
            privacyVersion: row.privacy_version == null ? null : String(row.privacy_version),
            privacyAcceptedAt: row.privacy_accepted_at == null ? null : String(row.privacy_accepted_at),
            currentProviderCode: String(row.current_provider_code),
            monthlyTokenLimit: Number(row.monthly_token_limit),
            hardLimitEnabled: Number(row.hard_limit_enabled) === 1,
        };
    }

    async acceptPrivacy(ownerKey, privacyVersion) {
        this._assertReady();
        this._ensurePreference(ownerKey);
        const acceptedAt = this.now();
        this._execute(
            `UPDATE ai_preference
             SET privacy_version = ?, privacy_accepted_at = ?, updated_at = ?
             WHERE owner_key = ?`,
            [privacyVersion, acceptedAt, acceptedAt, ownerKey]
        );
        await this._commitMutation();
        return this.getPreference(ownerKey);
    }

    async updateBudget(ownerKey, monthlyTokenLimit, hardLimitEnabled) {
        this._assertReady();
        this._ensurePreference(ownerKey);
        this._execute(
            `UPDATE ai_preference
             SET monthly_token_limit = ?, hard_limit_enabled = ?, updated_at = ?
             WHERE owner_key = ?`,
            [monthlyTokenLimit, hardLimitEnabled ? 1 : 0, this.now(), ownerKey]
        );
        await this._commitMutation();
        return this.getPreference(ownerKey);
    }

    getMonthlyUsage(ownerKey, targetMonth = monthKey()) {
        this._assertReady();
        const row = this._queryOne(
            'SELECT * FROM ai_monthly_usage WHERE owner_key = ? AND month = ?',
            [ownerKey, targetMonth]
        );
        return {
            ownerKey,
            month: targetMonth,
            promptTokens: Number(row?.prompt_tokens || 0),
            completionTokens: Number(row?.completion_tokens || 0),
            totalTokens: Number(row?.total_tokens || 0),
            requestCount: Number(row?.request_count || 0),
        };
    }

    async createConversation(ownerKey, agentCode, title = DEFAULT_CONVERSATION_TITLE) {
        this._assertReady();
        if (!this.getAgent(agentCode)) {
            throw new AIDatabaseError('agent_not_found', '未找到指定的智能体。');
        }
        const id = this.idFactory();
        const timestamp = this.now();
        this._execute(
            `INSERT INTO ai_conversation (id, owner_key, agent_code, title, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, ownerKey, agentCode, title, timestamp, timestamp]
        );
        await this._commitMutation();
        return this.getConversation(ownerKey, id);
    }

    listConversations(ownerKey, limit = 100) {
        this._assertReady();
        const normalizedLimit = Math.max(1, Math.min(200, Number(limit) || 100));
        return this._query(
            `SELECT c.*, a.name AS agent_name,
                    (SELECT COUNT(*) FROM ai_message m WHERE m.conversation_id = c.id) AS message_count,
                    (SELECT COALESCE(SUM(m.total_tokens), 0) FROM ai_message m WHERE m.conversation_id = c.id) AS total_tokens
             FROM ai_conversation c
             LEFT JOIN ai_agent a ON a.code = c.agent_code
             WHERE c.owner_key = ?
             ORDER BY c.updated_at DESC, c.id DESC
             LIMIT ?`,
            [ownerKey, normalizedLimit]
        ).map(mapConversationRow);
    }

    getConversation(ownerKey, conversationId) {
        this._assertReady();
        return mapConversationRow(this._queryOne(
            `SELECT c.*, a.name AS agent_name,
                    (SELECT COUNT(*) FROM ai_message m WHERE m.conversation_id = c.id) AS message_count,
                    (SELECT COALESCE(SUM(m.total_tokens), 0) FROM ai_message m WHERE m.conversation_id = c.id) AS total_tokens
             FROM ai_conversation c
             LEFT JOIN ai_agent a ON a.code = c.agent_code
             WHERE c.owner_key = ? AND c.id = ?`,
            [ownerKey, conversationId]
        ));
    }

    async renameConversation(ownerKey, conversationId, title) {
        this._assertReady();
        const changed = this._execute(
            'UPDATE ai_conversation SET title = ?, updated_at = ? WHERE id = ? AND owner_key = ?',
            [title, this.now(), conversationId, ownerKey]
        );
        if (!changed) {
            throw new AIDatabaseError('conversation_not_found', '未找到指定的会话。');
        }
        await this._commitMutation();
        return this.getConversation(ownerKey, conversationId);
    }

    async deleteConversation(ownerKey, conversationId) {
        this._assertReady();
        const deleted = this._transaction(() => {
            const owned = this._queryOne(
                'SELECT id FROM ai_conversation WHERE id = ? AND owner_key = ?',
                [conversationId, ownerKey]
            );
            if (!owned) {
                return false;
            }
            this._execute('DELETE FROM ai_message WHERE conversation_id = ?', [conversationId]);
            this._execute('DELETE FROM ai_conversation WHERE id = ? AND owner_key = ?', [conversationId, ownerKey]);
            return true;
        });
        if (deleted) {
            await this._commitMutation();
        }
        return deleted;
    }

    listMessages(ownerKey, conversationId, options = {}) {
        this._assertReady();
        if (!this.getConversation(ownerKey, conversationId)) {
            throw new AIDatabaseError('conversation_not_found', '未找到指定的会话。');
        }
        const limit = Math.max(1, Math.min(200, Number(options.limit) || 100));
        const params = [conversationId];
        let beforeClause = '';
        if (typeof options.before === 'string' && options.before) {
            beforeClause = 'AND created_at < ?';
            params.push(options.before);
        }
        params.push(limit);
        return this._query(
            `SELECT * FROM ai_message
             WHERE conversation_id = ? ${beforeClause}
             ORDER BY created_at DESC, rowid DESC
             LIMIT ?`,
            params
        ).reverse().map(mapMessageRow);
    }

    listPromptMessages(ownerKey, conversationId) {
        this._assertReady();
        if (!this.getConversation(ownerKey, conversationId)) {
            throw new AIDatabaseError('conversation_not_found', '未找到指定的会话。');
        }
        return this._query(
            `SELECT * FROM ai_message
             WHERE conversation_id = ?
               AND ((role = 'user' AND status = 'complete') OR (role = 'assistant' AND status = 'complete'))
             ORDER BY created_at ASC, rowid ASC`,
            [conversationId]
        ).map(mapMessageRow);
    }

    async createMessagePair(ownerKey, conversationId, userContent) {
        this._assertReady();
        const conversation = this.getConversation(ownerKey, conversationId);
        if (!conversation) {
            throw new AIDatabaseError('conversation_not_found', '未找到指定的会话。');
        }

        const userMessageId = this.idFactory();
        const assistantMessageId = this.idFactory();
        const timestamp = this.now();
        this._transaction(() => {
            this._execute(
                `INSERT INTO ai_message (
                    id, conversation_id, role, content, status, usage_status, created_at, updated_at
                 ) VALUES (?, ?, 'user', ?, 'complete', 'unknown', ?, ?)`,
                [userMessageId, conversationId, userContent, timestamp, timestamp]
            );
            this._execute(
                `INSERT INTO ai_message (
                    id, conversation_id, role, content, status, usage_status, created_at, updated_at
                 ) VALUES (?, ?, 'assistant', '', 'pending', 'unknown', ?, ?)`,
                [assistantMessageId, conversationId, timestamp, timestamp]
            );

            const nextTitle = conversation.title === DEFAULT_CONVERSATION_TITLE
                ? userContent.replace(/\s+/g, ' ').trim().slice(0, 24) || DEFAULT_CONVERSATION_TITLE
                : conversation.title;
            this._execute(
                'UPDATE ai_conversation SET title = ?, updated_at = ? WHERE id = ? AND owner_key = ?',
                [nextTitle, timestamp, conversationId, ownerKey]
            );
        });
        await this._commitMutation();

        const messages = this._query(
            'SELECT * FROM ai_message WHERE id IN (?, ?) ORDER BY created_at ASC, rowid ASC',
            [userMessageId, assistantMessageId]
        ).map(mapMessageRow);
        return {
            userMessage: messages.find((message) => message.id === userMessageId),
            assistantMessage: messages.find((message) => message.id === assistantMessageId),
            conversation: this.getConversation(ownerKey, conversationId),
        };
    }

    async completeAssistantMessage(ownerKey, conversationId, messageId, content, usage) {
        this._assertReady();
        const usageIsExact = usage?.status === 'exact';
        const promptTokens = usageIsExact ? Math.max(0, Math.floor(Number(usage.promptTokens) || 0)) : 0;
        const completionTokens = usageIsExact ? Math.max(0, Math.floor(Number(usage.completionTokens) || 0)) : 0;
        const totalTokens = usageIsExact
            ? Math.max(0, Math.floor(Number(usage.totalTokens) || promptTokens + completionTokens))
            : 0;
        const timestamp = this.now();
        const targetMonth = monthKey(new Date(timestamp));

        this._transaction(() => {
            const changed = this._execute(
                `UPDATE ai_message
                 SET content = ?, status = 'complete', prompt_tokens = ?, completion_tokens = ?,
                     total_tokens = ?, usage_status = ?, error_kind = NULL, updated_at = ?
                 WHERE id = ? AND conversation_id = ? AND role = 'assistant' AND status = 'pending'
                   AND EXISTS (
                       SELECT 1 FROM ai_conversation c
                       WHERE c.id = ai_message.conversation_id AND c.owner_key = ?
                   )`,
                [
                    content,
                    promptTokens,
                    completionTokens,
                    totalTokens,
                    usageIsExact ? 'exact' : 'unknown',
                    timestamp,
                    messageId,
                    conversationId,
                    ownerKey,
                ]
            );
            if (!changed) {
                throw new AIDatabaseError('message_not_found', '未找到待完成的回复消息。');
            }
            this._execute(
                `INSERT INTO ai_monthly_usage (
                    owner_key, month, prompt_tokens, completion_tokens, total_tokens, request_count, updated_at
                 ) VALUES (?, ?, ?, ?, ?, 1, ?)
                 ON CONFLICT(owner_key, month) DO UPDATE SET
                    prompt_tokens = ai_monthly_usage.prompt_tokens + excluded.prompt_tokens,
                    completion_tokens = ai_monthly_usage.completion_tokens + excluded.completion_tokens,
                    total_tokens = ai_monthly_usage.total_tokens + excluded.total_tokens,
                    request_count = ai_monthly_usage.request_count + 1,
                    updated_at = excluded.updated_at`,
                [ownerKey, targetMonth, promptTokens, completionTokens, totalTokens, timestamp]
            );
            this._execute('UPDATE ai_conversation SET updated_at = ? WHERE id = ? AND owner_key = ?', [
                timestamp,
                conversationId,
                ownerKey,
            ]);
        });
        await this._commitMutation();
        return mapMessageRow(this._queryOne('SELECT * FROM ai_message WHERE id = ?', [messageId]));
    }

    async failAssistantMessage(ownerKey, conversationId, messageId, status, errorKind, partialContent = '') {
        this._assertReady();
        if (status !== 'error' && status !== 'cancelled') {
            throw new AIDatabaseError('invalid_message_status', '回复消息状态无效。');
        }
        const changed = this._execute(
            `UPDATE ai_message
             SET content = ?, status = ?, error_kind = ?, updated_at = ?
             WHERE id = ? AND conversation_id = ? AND role = 'assistant' AND status = 'pending'
               AND EXISTS (
                   SELECT 1 FROM ai_conversation c
                   WHERE c.id = ai_message.conversation_id AND c.owner_key = ?
               )`,
            [partialContent, status, errorKind, this.now(), messageId, conversationId, ownerKey]
        );
        if (!changed) {
            throw new AIDatabaseError('message_not_found', '未找到待更新的回复消息。');
        }
        await this._commitMutation();
        return mapMessageRow(this._queryOne('SELECT * FROM ai_message WHERE id = ?', [messageId]));
    }

    getBootstrap(ownerKey, privacyVersion) {
        this._assertReady();
        const preference = this.getPreference(ownerKey);
        const usage = this.getMonthlyUsage(ownerKey);
        return {
            agents: this.listAgents(),
            providers: this.listProviders(),
            conversations: this.listConversations(ownerKey),
            preference: {
                currentProviderCode: preference.currentProviderCode,
                monthlyTokenLimit: preference.monthlyTokenLimit,
                hardLimitEnabled: preference.hardLimitEnabled,
                privacyAccepted: preference.privacyVersion === privacyVersion && Boolean(preference.privacyAcceptedAt),
                privacyAcceptedAt: preference.privacyAcceptedAt,
                privacyVersion,
            },
            usage: {
                ...usage,
                overLimit: preference.monthlyTokenLimit >= 0 && usage.totalTokens >= preference.monthlyTokenLimit,
            },
        };
    }

    async close() {
        if (!this.initialized || !this.db || this.closed) {
            return;
        }
        if (this.dirty) {
            await this.flush();
        } else {
            await this.persistChain;
        }
        this.db.close();
        this.db = null;
        this.closed = true;
        this.initialized = false;
    }
}

module.exports = {
    SCHEMA_VERSION,
    DEFAULT_OWNER_KEY,
    DEFAULT_MONTHLY_TOKEN_LIMIT,
    DEFAULT_CONVERSATION_TITLE,
    AIDatabaseError,
    AIAssistantDatabase,
    monthKey,
};
