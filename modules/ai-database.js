const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const initSqlJs = require('sql.js');
const { getBuiltinAgents } = require('./ai-agent-catalog');
const { PROVIDER_PRESETS } = require('./ai-provider-client');
const { getBuiltinKnowledgeSkills } = require('./ai-skill-catalog');
const { BUILTIN_AGENT_SKILL_BINDINGS } = require('./ai-agent-skill-bindings');

const SCHEMA_VERSION = 5;
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

function parseJsonObject(value) {
    if (typeof value !== 'string' || !value) {
        return null;
    }
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

// 解析 ai_agent_skill.config（{ referenceIds: string[] | null }）的三态 referenceIds：
// null/缺省 → null（表示「该技能全部引用」）；数组 → 字符串数组。
function parseReferenceIds(configValue) {
    if (typeof configValue !== 'string' || !configValue) {
        return null;
    }
    try {
        const parsed = JSON.parse(configValue);
        if (parsed === null) {
            return null;
        }
        if (parsed && parsed.referenceIds === null) {
            return null;
        }
        if (parsed && Array.isArray(parsed.referenceIds)) {
            return parsed.referenceIds.map(String);
        }
    } catch {
        // 落到默认 null。
    }
    return null;
}

function parseKnowledgePayload(value) {
    if (typeof value !== 'string' || !value) {
        return { body: '', references: [], metadata: {} };
    }
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object') {
            return { body: '', references: [], metadata: {} };
        }
        const references = Array.isArray(parsed.references)
            ? parsed.references
                  .filter((reference) => reference && typeof reference === 'object')
                  .map((reference) => ({
                      id: String(reference.id || ''),
                      title: String(reference.title || ''),
                      content: String(reference.content || ''),
                  }))
                  .filter((reference) => reference.id)
            : [];
        return {
            body: typeof parsed.body === 'string' ? parsed.body : '',
            references,
            metadata: parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {},
        };
    } catch {
        return { body: '', references: [], metadata: {} };
    }
}

function validateCustomAgentCode(value) {
    const code = typeof value === 'string' ? value.trim() : '';
    if (!/^[a-z0-9_-]{1,64}$/.test(code)) {
        throw new AIDatabaseError(
            'invalid_agent_code',
            '智能体标识只能包含小写字母、数字、下划线或连字符（1-64 位）。'
        );
    }
    return code;
}

function mapKnowledgeSkillRow(row, includePayload = false) {
    if (!row) {
        return null;
    }
    const skill = {
        code: String(row.code),
        name: String(row.name),
        description: String(row.description || ''),
        kind: String(row.kind || 'knowledge'),
        sourceType: String(row.source_type || 'builtin'),
        sourceUrl: String(row.source_url || ''),
        license: String(row.license || ''),
        evidenceLevel: String(row.evidence_level || ''),
        riskLevel: String(row.risk_level || ''),
        audience: String(row.audience || ''),
        contentVersion: String(row.content_version || '0'),
        enabled: Number(row.enabled) === 1,
        sort: Number(row.sort || 0),
    };
    if (includePayload) {
        skill.payload = parseKnowledgePayload(row.knowledge_payload);
    }
    return skill;
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
        sourceType: String(row.source_type || 'builtin'),
        enabled: Number(row.enabled) === 1,
        toolsEnabled: Number(row.tools_enabled) === 1,
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
    const model = String(row.model || '');
    // endpoints：显式列表优先；为空但 model 非空时惰性合成单项列表（旧数据/种子免回填）。
    const endpoints = parseJsonArray(row.endpoints_json)
        .map((value) => String(value || ''))
        .filter((value) => value.length > 0);
    const resolvedEndpoints = endpoints.length > 0 ? endpoints : (model ? [model] : []);
    const provider = {
        code: String(row.code),
        name: String(row.name),
        baseUrl: String(row.base_url),
        model,
        endpoints: resolvedEndpoints,
        activeEndpoint: model,
        enabled: Number(row.enabled) === 1,
        hasApiKey: Number(row.has_key) === 1,
        supportsVision: Number(row.supports_vision) === 1,
        sort: Number(row.sort || 0),
        updatedAt: String(row.updated_at),
    };
    if (includeSecret) {
        provider.apiKeyEncrypted = String(row.api_key_enc || '');
    }
    return provider;
}

function mapAttachmentRow(row) {
    if (!row) {
        return null;
    }
    return {
        id: String(row.id),
        conversationId: String(row.conversation_id),
        messageId: row.message_id == null ? null : String(row.message_id),
        fileName: String(row.file_name),
        relativePath: String(row.relative_path),
        mimeType: String(row.mime_type),
        sizeBytes: Number(row.size_bytes || 0),
        sha256: String(row.sha256),
        width: row.width == null ? null : Number(row.width),
        height: row.height == null ? null : Number(row.height),
        status: String(row.status),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
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
        knowledgeSnapshot: row.knowledge_snapshot == null ? null : String(row.knowledge_snapshot),
        knowledgeProvenance: parseJsonObject(row.knowledge_provenance),
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
        this.builtinSkills = options.builtinSkills || getBuiltinKnowledgeSkills();
        this.builtinAgentSkillBindings = options.builtinAgentSkillBindings || BUILTIN_AGENT_SKILL_BINDINGS;
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
                this._syncSkills();
                this._syncAgentSkills();
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
                source_type TEXT NOT NULL DEFAULT 'builtin',
                tools_enabled INTEGER NOT NULL DEFAULT 0,
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
                endpoints_json TEXT NOT NULL DEFAULT '[]',
                api_key_enc TEXT NOT NULL DEFAULT '',
                has_key INTEGER NOT NULL DEFAULT 0,
                supports_vision INTEGER NOT NULL DEFAULT 0,
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
                knowledge_snapshot TEXT,
                knowledge_provenance TEXT,
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
                current_provider_code TEXT NOT NULL DEFAULT 'volcengine',
                monthly_token_limit INTEGER NOT NULL DEFAULT 10000000,
                hard_limit_enabled INTEGER NOT NULL DEFAULT 1,
                knowledge_section_visible INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (current_provider_code) REFERENCES ai_provider(code)
            );

            CREATE TABLE IF NOT EXISTS ai_skill (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                kind TEXT NOT NULL DEFAULT 'knowledge' CHECK(kind IN ('tool', 'knowledge')),
                knowledge_payload TEXT NOT NULL DEFAULT '',
                source_type TEXT NOT NULL DEFAULT 'builtin',
                source_url TEXT NOT NULL DEFAULT '',
                license TEXT NOT NULL DEFAULT '',
                evidence_level TEXT NOT NULL DEFAULT '未标注',
                risk_level TEXT NOT NULL DEFAULT '常规',
                audience TEXT NOT NULL DEFAULT '教师',
                content_version TEXT NOT NULL DEFAULT '0',
                enabled INTEGER NOT NULL DEFAULT 1,
                sort INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_agent_skill (
                agent_code TEXT NOT NULL,
                skill_code TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                sort INTEGER NOT NULL DEFAULT 0,
                config TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (agent_code, skill_code),
                FOREIGN KEY (agent_code) REFERENCES ai_agent(code) ON DELETE CASCADE,
                FOREIGN KEY (skill_code) REFERENCES ai_skill(code) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_ai_conversation_owner_updated
                ON ai_conversation(owner_key, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_ai_message_conversation_created
                ON ai_message(conversation_id, created_at, id);
            CREATE INDEX IF NOT EXISTS idx_ai_monthly_usage_owner_month
                ON ai_monthly_usage(owner_key, month);
            CREATE INDEX IF NOT EXISTS idx_ai_agent_skill_agent
                ON ai_agent_skill(agent_code, enabled, sort);
            CREATE INDEX IF NOT EXISTS idx_ai_skill_kind_enabled
                ON ai_skill(kind, enabled, sort);

            CREATE TABLE IF NOT EXISTS ai_tool_call (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                tool_call_id TEXT NOT NULL,
                arguments TEXT NOT NULL DEFAULT '',
                result_size INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL CHECK(status IN ('success', 'error', 'timeout', 'rejected')),
                round INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES ai_conversation(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_ai_tool_call_message
                ON ai_tool_call(message_id);
            CREATE INDEX IF NOT EXISTS idx_ai_tool_call_conversation
                ON ai_tool_call(conversation_id);

            CREATE TABLE IF NOT EXISTS ai_attachment (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                message_id TEXT,
                file_name TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                width INTEGER,
                height INTEGER,
                status TEXT NOT NULL CHECK(status IN ('pending', 'attached', 'orphaned', 'deleted')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES ai_conversation(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_ai_attachment_conversation
                ON ai_attachment(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_ai_attachment_message
                ON ai_attachment(message_id);
            CREATE INDEX IF NOT EXISTS idx_ai_attachment_status
                ON ai_attachment(status);
        `);

        const schemaVersionRow = this._queryOne('SELECT value FROM ai_schema_meta WHERE key = ?', ['schema_version']);
        const previousSchemaVersion = Number(schemaVersionRow?.value || 0);
        if (previousSchemaVersion > SCHEMA_VERSION) {
            throw new AIDatabaseError('schema_version_unsupported', 'AI 助手数据库版本高于当前应用支持范围。');
        }
        if (previousSchemaVersion > 0 && previousSchemaVersion < 2) {
            this._execute('UPDATE ai_preference SET hard_limit_enabled = 1');
        }
        if (previousSchemaVersion > 0 && previousSchemaVersion < 3) {
            // Phase 2：消息的知识快照/溯源 + 智能体来源类型。
            // ai_skill / ai_agent_skill 表已由上面的 CREATE TABLE IF NOT EXISTS 创建。
            this._addColumnIfMissing('ai_message', 'knowledge_snapshot', 'TEXT');
            this._addColumnIfMissing('ai_message', 'knowledge_provenance', 'TEXT');
            this._addColumnIfMissing('ai_agent', 'source_type', "TEXT NOT NULL DEFAULT 'builtin'");
        }
        if (previousSchemaVersion > 0 && previousSchemaVersion < 4) {
            // Phase 3：按 agent 启用工具 + provider 视觉能力位。
            // ai_tool_call / ai_attachment 表由 CREATE TABLE IF NOT EXISTS 创建。
            this._addColumnIfMissing('ai_agent', 'tools_enabled', 'INTEGER NOT NULL DEFAULT 0');
            this._addColumnIfMissing('ai_provider', 'supports_vision', 'INTEGER NOT NULL DEFAULT 0');
        }
        if (previousSchemaVersion > 0 && previousSchemaVersion < 5) {
            // Phase 5：provider 多接入点列表 + 知识技能区块可见性开关。
            this._addColumnIfMissing('ai_provider', 'endpoints_json', "TEXT NOT NULL DEFAULT '[]'");
            this._addColumnIfMissing('ai_preference', 'knowledge_section_visible', 'INTEGER NOT NULL DEFAULT 0');
            // DeepSeek 官方渠道已下线：把仍指向 deepseek 的偏好迁到火山方舟，再清除 deepseek 行。
            this._execute("UPDATE ai_preference SET current_provider_code = 'volcengine' WHERE current_provider_code = 'deepseek'");
            this._execute("DELETE FROM ai_provider WHERE code = 'deepseek'");
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
                    tools_enabled, enabled, sort, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)
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
            // 默认接入点列表：preset 显式给出则用之，否则退化为 [defaultModel]。
            const defaultEndpoints = Array.isArray(provider.defaultEndpoints) && provider.defaultEndpoints.length > 0
                ? provider.defaultEndpoints
                : (provider.defaultModel ? [provider.defaultModel] : []);
            const defaultActive = provider.defaultModel || '';
            const endpointsJson = JSON.stringify(defaultEndpoints);
            this._execute(
                `INSERT INTO ai_provider (
                    code, name, base_url, model, endpoints_json, api_key_enc, has_key, enabled, sort, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, '', 0, 1, ?, ?, ?)
                ON CONFLICT(code) DO UPDATE SET
                    name = excluded.name,
                    sort = excluded.sort,
                    endpoints_json = CASE WHEN ai_provider.endpoints_json = '[]' THEN excluded.endpoints_json ELSE ai_provider.endpoints_json END,
                    model = CASE WHEN ai_provider.model = '' THEN excluded.model ELSE ai_provider.model END`,
                [
                    provider.code,
                    provider.name,
                    provider.baseUrl,
                    defaultActive,
                    endpointsJson,
                    provider.sort,
                    timestamp,
                    timestamp,
                ]
            );
        }
    }

    _syncSkills() {
        const timestamp = this.now();
        this.builtinSkills.forEach((skill, index) => {
            const payload = JSON.stringify({
                body: skill.body,
                references: skill.references.map((reference) => ({
                    id: reference.id,
                    title: reference.title,
                    content: reference.content,
                })),
                metadata: skill.metadata,
            });
            const existing = this._queryOne(
                'SELECT source_type, content_version FROM ai_skill WHERE code = ?',
                [skill.code]
            );
            if (!existing) {
                this._execute(
                    `INSERT INTO ai_skill (
                        code, name, description, kind, knowledge_payload,
                        source_type, source_url, license, evidence_level, risk_level, audience,
                        content_version, enabled, sort, created_at, updated_at
                     ) VALUES (?, ?, ?, 'knowledge', ?, 'builtin', '', ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
                    [
                        skill.code,
                        skill.name,
                        skill.description,
                        payload,
                        skill.metadata.license,
                        skill.metadata.evidenceLevel,
                        skill.metadata.riskLevel,
                        skill.metadata.audience,
                        skill.contentVersion,
                        index,
                        timestamp,
                        timestamp,
                    ]
                );
            } else if (
                String(existing.source_type) === 'builtin'
                && this._versionIsNewer(skill.contentVersion, String(existing.content_version))
            ) {
                // 仅当内置技能版本严格上升时刷新正文；自定义技能或旧版本保持不动。
                this._execute(
                    `UPDATE ai_skill SET
                        name = ?, description = ?, knowledge_payload = ?, license = ?,
                        evidence_level = ?, risk_level = ?, audience = ?, content_version = ?,
                        sort = ?, updated_at = ?
                     WHERE code = ? AND source_type = 'builtin'`,
                    [
                        skill.name,
                        skill.description,
                        payload,
                        skill.metadata.license,
                        skill.metadata.evidenceLevel,
                        skill.metadata.riskLevel,
                        skill.metadata.audience,
                        skill.contentVersion,
                        index,
                        timestamp,
                        skill.code,
                    ]
                );
            }
        });
    }

    _versionIsNewer(candidate, stored) {
        const parse = (value) => String(value || '0').split('.').map((part) => Number(part) || 0);
        const candidateParts = parse(candidate);
        const storedParts = parse(stored);
        const length = Math.max(candidateParts.length, storedParts.length);
        for (let index = 0; index < length; index += 1) {
            const candidatePart = candidateParts[index] || 0;
            const storedPart = storedParts[index] || 0;
            if (candidatePart !== storedPart) {
                return candidatePart > storedPart;
            }
        }
        return false;
    }

    _syncAgentSkills() {
        const timestamp = this.now();
        // ON CONFLICT DO NOTHING：保留用户对内置绑定的停用 / referenceIds 微调；需恢复
        // seed 时由治理层的 resetBuiltinAgentBindings 删除后重跑。
        for (const binding of this.builtinAgentSkillBindings) {
            const config = JSON.stringify({ referenceIds: binding.referenceIds });
            this._execute(
                `INSERT INTO ai_agent_skill (agent_code, skill_code, enabled, sort, config, created_at, updated_at)
                 VALUES (?, ?, 1, ?, ?, ?, ?)
                 ON CONFLICT(agent_code, skill_code) DO NOTHING`,
                [binding.agentCode, binding.skillCode, binding.sort, config, timestamp, timestamp]
            );
        }
    }

    listKnowledgeSkills(options = {}) {
        this._assertReady();
        const includeDisabled = Boolean(options.includeDisabled);
        const where = includeDisabled
            ? "WHERE kind = 'knowledge'"
            : "WHERE kind = 'knowledge' AND enabled = 1";
        return this._query(`SELECT * FROM ai_skill ${where} ORDER BY sort ASC, code ASC`)
            .map((row) => mapKnowledgeSkillRow(row));
    }

    getKnowledgeSkill(code) {
        this._assertReady();
        return mapKnowledgeSkillRow(
            this._queryOne('SELECT * FROM ai_skill WHERE code = ?', [code]),
            true
        );
    }

    listAgentSkillBindings(agentCode) {
        this._assertReady();
        return this._query(
            `SELECT x.skill_code, x.enabled AS binding_enabled, x.sort, x.config,
                    s.name AS skill_name, s.enabled AS skill_enabled, s.source_type
             FROM ai_agent_skill x
             JOIN ai_skill s ON s.code = x.skill_code
             WHERE x.agent_code = ?
             ORDER BY x.sort ASC, x.skill_code ASC`,
            [agentCode]
        ).map((row) => ({
            skillCode: String(row.skill_code),
            name: String(row.skill_name || row.skill_code),
            enabled: Number(row.binding_enabled) === 1,
            sort: Number(row.sort || 0),
            referenceIds: parseReferenceIds(row.config),
            skillEnabled: Number(row.skill_enabled) === 1,
            sourceType: String(row.source_type || 'builtin'),
        }));
    }

    // 注入器消费的过滤集：启用的绑定 + 启用的技能 + knowledge 类 + 有 payload。
    getEnabledAgentKnowledgeBindings(agentCode) {
        this._assertReady();
        return this._query(
            `SELECT x.skill_code, x.sort, x.config
             FROM ai_agent_skill x
             JOIN ai_skill s ON s.code = x.skill_code
             WHERE x.agent_code = ? AND x.enabled = 1 AND s.enabled = 1
               AND s.kind = 'knowledge' AND s.knowledge_payload != ''
             ORDER BY x.sort ASC, x.skill_code ASC`,
            [agentCode]
        ).map((row) => ({
            skillCode: String(row.skill_code),
            sort: Number(row.sort || 0),
            referenceIds: parseReferenceIds(row.config),
        }));
    }

    getKnowledgeSummaryForBootstrap() {
        this._assertReady();
        const skillRows = this._query(
            `SELECT code, name, description, source_type, license, content_version,
                    evidence_level, risk_level, audience, knowledge_payload
             FROM ai_skill
             WHERE kind = 'knowledge' AND enabled = 1
             ORDER BY sort ASC, code ASC`
        );
        const skills = skillRows.map((row) => {
            const payload = parseKnowledgePayload(row.knowledge_payload);
            return {
                code: String(row.code),
                name: String(row.name),
                description: String(row.description || ''),
                referenceCount: payload.references.length,
                sourceType: String(row.source_type || 'builtin'),
                license: String(row.license || ''),
                contentVersion: String(row.content_version || '0'),
                evidenceLevel: String(row.evidence_level || ''),
                riskLevel: String(row.risk_level || ''),
                audience: String(row.audience || ''),
            };
        });
        const totalReferences = skills.reduce((total, skill) => total + skill.referenceCount, 0);

        const bindingRows = this._query(
            `SELECT x.agent_code, x.skill_code, x.config
             FROM ai_agent_skill x
             JOIN ai_skill s ON s.code = x.skill_code
             WHERE x.enabled = 1 AND s.enabled = 1 AND s.kind = 'knowledge'
             ORDER BY x.agent_code ASC, x.sort ASC, x.skill_code ASC`
        );
        const agentBindings = {};
        for (const row of bindingRows) {
            const agentCode = String(row.agent_code);
            if (!agentBindings[agentCode]) {
                agentBindings[agentCode] = [];
            }
            agentBindings[agentCode].push({
                skillCode: String(row.skill_code),
                referenceIds: parseReferenceIds(row.config),
            });
        }

        return {
            totalSkills: skills.length,
            totalReferences,
            skills,
            agentBindings,
        };
    }

    listAllAgents() {
        this._assertReady();
        return this._query('SELECT * FROM ai_agent ORDER BY sort ASC, code ASC').map((row) => mapAgentRow(row));
    }

    getAgentByCode(code) {
        this._assertReady();
        return mapAgentRow(this._queryOne('SELECT * FROM ai_agent WHERE code = ?', [code]), true);
    }

    async createCustomAgent(payload = {}) {
        this._assertReady();
        const code = validateCustomAgentCode(payload.code);
        if (this._queryOne('SELECT 1 FROM ai_agent WHERE code = ?', [code])) {
            throw new AIDatabaseError('agent_already_exists', '该智能体标识已存在。');
        }
        const timestamp = this.now();
        const maxSortRow = this._queryOne('SELECT COALESCE(MAX(sort), -1) AS max_sort FROM ai_agent');
        const sort = Number(maxSortRow?.max_sort || -1) + 1;
        this._execute(
            `INSERT INTO ai_agent (
                code, name, display_name, avatar_text, avatar_tone, tagline, teacher_support,
                expertise_tags, system_prompt, starter_prompts, source, license, content_version,
                source_type, enabled, sort, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'custom', '', '1.0.0', 'custom', 1, ?, ?, ?)`,
            [
                code,
                payload.name || code,
                payload.displayName || payload.name || code,
                payload.avatarText || 'AI',
                payload.avatarTone || 'neutral',
                payload.tagline || '',
                payload.teacherSupport || '',
                JSON.stringify(Array.isArray(payload.expertiseTags) ? payload.expertiseTags : []),
                payload.systemPrompt || '',
                JSON.stringify(Array.isArray(payload.starterPrompts) ? payload.starterPrompts : []),
                sort,
                timestamp,
                timestamp,
            ]
        );
        await this._commitMutation();
        return this.getAgentByCode(code);
    }

    async updateCustomAgent(code, patch = {}) {
        this._assertReady();
        const existing = this._queryOne(
            'SELECT 1 FROM ai_agent WHERE code = ? AND source_type = ?',
            [code, 'custom']
        );
        if (!existing) {
            throw new AIDatabaseError('agent_not_editable', '只能编辑自定义智能体。');
        }
        const fields = [];
        const params = [];
        const apply = (column, value) => {
            fields.push(`${column} = ?`);
            params.push(value);
        };
        if (patch.name !== undefined) {
            apply('name', patch.name);
        }
        if (patch.displayName !== undefined) {
            apply('display_name', patch.displayName);
        }
        if (patch.avatarText !== undefined) {
            apply('avatar_text', patch.avatarText);
        }
        if (patch.avatarTone !== undefined) {
            apply('avatar_tone', patch.avatarTone);
        }
        if (patch.tagline !== undefined) {
            apply('tagline', patch.tagline);
        }
        if (patch.teacherSupport !== undefined) {
            apply('teacher_support', patch.teacherSupport);
        }
        if (patch.expertiseTags !== undefined) {
            apply('expertise_tags', JSON.stringify(Array.isArray(patch.expertiseTags) ? patch.expertiseTags : []));
        }
        if (patch.systemPrompt !== undefined) {
            apply('system_prompt', patch.systemPrompt);
        }
        if (patch.starterPrompts !== undefined) {
            apply('starter_prompts', JSON.stringify(Array.isArray(patch.starterPrompts) ? patch.starterPrompts : []));
        }
        if (fields.length === 0) {
            return this.getAgentByCode(code);
        }
        fields.push('updated_at = ?');
        params.push(this.now(), code);
        this._execute(
            `UPDATE ai_agent SET ${fields.join(', ')} WHERE code = ? AND source_type = 'custom'`,
            params
        );
        await this._commitMutation();
        return this.getAgentByCode(code);
    }

    async deleteCustomAgent(code) {
        this._assertReady();
        const inUse = this._queryOne('SELECT 1 FROM ai_conversation WHERE agent_code = ? LIMIT 1', [code]);
        if (inUse) {
            throw new AIDatabaseError('agent_in_use', '该智能体仍有会话，请先删除相关会话后再删除。');
        }
        const deleted = this._transaction(() => {
            const existing = this._queryOne(
                'SELECT 1 FROM ai_agent WHERE code = ? AND source_type = ?',
                [code, 'custom']
            );
            if (!existing) {
                return false;
            }
            this._execute('DELETE FROM ai_agent_skill WHERE agent_code = ?', [code]);
            this._execute('DELETE FROM ai_agent WHERE code = ? AND source_type = ?', [code, 'custom']);
            return true;
        });
        if (deleted) {
            await this._commitMutation();
        }
        return deleted;
    }

    async setAgentEnabled(code, enabled) {
        this._assertReady();
        const changed = this._execute(
            'UPDATE ai_agent SET enabled = ?, updated_at = ? WHERE code = ?',
            [enabled ? 1 : 0, this.now(), code]
        );
        if (!changed) {
            throw new AIDatabaseError('agent_not_found', '未找到指定的智能体。');
        }
        await this._commitMutation();
        return this.getAgentByCode(code);
    }

    async setAgentToolsEnabled(code, enabled) {
        this._assertReady();
        const changed = this._execute(
            'UPDATE ai_agent SET tools_enabled = ?, updated_at = ? WHERE code = ?',
            [enabled ? 1 : 0, this.now(), code]
        );
        if (!changed) {
            throw new AIDatabaseError('agent_not_found', '未找到指定的智能体。');
        }
        await this._commitMutation();
        return this.getAgentByCode(code);
    }

    async recordToolCall({ conversationId, messageId, toolName, toolCallId, arguments: args, resultSize, status, round }) {
        this._assertReady();
        const truncatedArgs = typeof args === 'string' ? args.slice(0, 2000) : '';
        this._execute(
            `INSERT INTO ai_tool_call (
                id, conversation_id, message_id, tool_name, tool_call_id, arguments,
                result_size, status, round, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                this.idFactory(),
                conversationId,
                messageId,
                toolName,
                toolCallId,
                truncatedArgs,
                Number(resultSize || 0),
                status,
                Number(round || 0),
                this.now(),
            ]
        );
        await this._commitMutation();
        return true;
    }

    listToolCalls(messageId) {
        this._assertReady();
        return this._query(
            `SELECT id, tool_name, tool_call_id, arguments, result_size, status, round, created_at
             FROM ai_tool_call WHERE message_id = ?
             ORDER BY round ASC, created_at ASC`,
            [messageId]
        ).map((row) => ({
            id: String(row.id),
            toolName: String(row.tool_name),
            toolCallId: String(row.tool_call_id),
            arguments: String(row.arguments || ''),
            resultSize: Number(row.result_size || 0),
            status: String(row.status),
            round: Number(row.round || 0),
            createdAt: String(row.created_at),
        }));
    }

    async createAttachment({ conversationId, fileName, relativePath, mimeType, sizeBytes, sha256, width, height }) {
        this._assertReady();
        const id = this.idFactory();
        const timestamp = this.now();
        this._execute(
            `INSERT INTO ai_attachment (
                id, conversation_id, message_id, file_name, relative_path, mime_type,
                size_bytes, sha256, width, height, status, created_at, updated_at
             ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
            [
                id, conversationId, fileName, relativePath, mimeType, sizeBytes, sha256,
                width == null ? null : width, height == null ? null : height, timestamp, timestamp,
            ]
        );
        await this._commitMutation();
        return mapAttachmentRow(this._queryOne('SELECT * FROM ai_attachment WHERE id = ?', [id]));
    }

    async linkAttachmentsToMessage(messageId, attachmentIds, conversationId) {
        this._assertReady();
        const ids = Array.isArray(attachmentIds)
            ? attachmentIds.filter((value) => typeof value === 'string' && value)
            : [];
        if (ids.length === 0) {
            return [];
        }
        const placeholders = ids.map(() => '?').join(', ');
        this._execute(
            `UPDATE ai_attachment SET message_id = ?, status = 'attached', updated_at = ?
             WHERE id IN (${placeholders}) AND conversation_id = ?`,
            [messageId, this.now(), ...ids, conversationId]
        );
        await this._commitMutation();
        return ids;
    }

    listAttachments(conversationId) {
        this._assertReady();
        return this._query(
            `SELECT * FROM ai_attachment WHERE conversation_id = ? AND status != 'deleted' ORDER BY created_at ASC`,
            [conversationId]
        ).map((row) => mapAttachmentRow(row));
    }

    listAttachmentsForMessage(messageId) {
        this._assertReady();
        return this._query(
            `SELECT * FROM ai_attachment WHERE message_id = ? AND status != 'deleted' ORDER BY created_at ASC`,
            [messageId]
        ).map((row) => mapAttachmentRow(row));
    }

    listAttachmentsByIds(attachmentIds, conversationId) {
        this._assertReady();
        const ids = Array.isArray(attachmentIds)
            ? attachmentIds.filter((value) => typeof value === 'string' && value)
            : [];
        if (ids.length === 0) {
            return [];
        }
        const placeholders = ids.map(() => '?').join(', ');
        return this._query(
            `SELECT * FROM ai_attachment WHERE id IN (${placeholders}) AND conversation_id = ? AND status = 'pending'`,
            [...ids, conversationId]
        ).map((row) => mapAttachmentRow(row));
    }

    listAttachmentPaths(conversationId) {
        this._assertReady();
        return this._query(
            'SELECT id, relative_path FROM ai_attachment WHERE conversation_id = ?',
            [conversationId]
        ).map((row) => ({ id: String(row.id), relativePath: String(row.relative_path) }));
    }

    listPromptAttachments(conversationId) {
        this._assertReady();
        return this._query(
            `SELECT a.* FROM ai_attachment a
             JOIN ai_message m ON m.id = a.message_id
             WHERE a.conversation_id = ? AND a.status = 'attached' AND m.role = 'user'
             ORDER BY a.created_at ASC`,
            [conversationId]
        ).map((row) => mapAttachmentRow(row));
    }

    async deleteAttachment(attachmentId) {
        this._assertReady();
        const changed = this._execute(
            `UPDATE ai_attachment SET status = 'deleted', updated_at = ? WHERE id = ?`,
            [this.now(), attachmentId]
        );
        if (changed) {
            await this._commitMutation();
        }
        return Boolean(changed);
    }

    async upsertAgentSkillBinding(agentCode, skillCode, referenceIds, enabled = true, sort = 0) {
        this._assertReady();
        const config = JSON.stringify({ referenceIds });
        this._execute(
            `INSERT INTO ai_agent_skill (agent_code, skill_code, enabled, sort, config, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(agent_code, skill_code) DO UPDATE SET
                enabled = excluded.enabled, sort = excluded.sort, config = excluded.config,
                updated_at = excluded.updated_at`,
            [agentCode, skillCode, enabled ? 1 : 0, sort, config, this.now(), this.now()]
        );
        await this._commitMutation();
        return this.listAgentSkillBindings(agentCode);
    }

    async setAgentSkillEnabled(agentCode, skillCode, enabled) {
        this._assertReady();
        const changed = this._execute(
            `UPDATE ai_agent_skill SET enabled = ?, updated_at = ?
             WHERE agent_code = ? AND skill_code = ?`,
            [enabled ? 1 : 0, this.now(), agentCode, skillCode]
        );
        if (!changed) {
            throw new AIDatabaseError('binding_not_found', '未找到指定的技能绑定。');
        }
        await this._commitMutation();
        return this.listAgentSkillBindings(agentCode);
    }

    async deleteAgentSkillBinding(agentCode, skillCode) {
        this._assertReady();
        const changed = this._execute(
            'DELETE FROM ai_agent_skill WHERE agent_code = ? AND skill_code = ?',
            [agentCode, skillCode]
        );
        if (!changed) {
            throw new AIDatabaseError('binding_not_found', '未找到指定的技能绑定。');
        }
        await this._commitMutation();
        return this.listAgentSkillBindings(agentCode);
    }

    async resetBuiltinAgentBindings(agentCode) {
        this._assertReady();
        const agent = this._queryOne(
            'SELECT 1 FROM ai_agent WHERE code = ? AND source_type = ?',
            [agentCode, 'builtin']
        );
        if (!agent) {
            throw new AIDatabaseError('agent_not_found', '未找到指定的内置智能体。');
        }
        const timestamp = this.now();
        this._transaction(() => {
            this._execute('DELETE FROM ai_agent_skill WHERE agent_code = ?', [agentCode]);
            for (const binding of this.builtinAgentSkillBindings) {
                if (binding.agentCode !== agentCode) {
                    continue;
                }
                const config = JSON.stringify({ referenceIds: binding.referenceIds });
                this._execute(
                    `INSERT INTO ai_agent_skill (agent_code, skill_code, enabled, sort, config, created_at, updated_at)
                     VALUES (?, ?, 1, ?, ?, ?, ?)`,
                    [binding.agentCode, binding.skillCode, binding.sort, config, timestamp, timestamp]
                );
            }
        });
        await this._commitMutation();
        return this.listAgentSkillBindings(agentCode);
    }

    _ensurePreference(ownerKey) {
        this._execute(
            `INSERT OR IGNORE INTO ai_preference (
                owner_key, current_provider_code, monthly_token_limit, hard_limit_enabled, updated_at
             ) VALUES (?, 'volcengine', ?, 1, ?)`,
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

    _addColumnIfMissing(table, column, declaration) {
        try {
            this._execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
        } catch (error) {
            if (!/duplicate column/i.test(String(error?.message || ''))) {
                throw error;
            }
        }
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

    // 在事务内写入 assistant 消息的知识快照/溯源；无知识时写 NULL，使 user 消息与
    // 无知识 assistant 消息的列保持 NULL。调用方需已在 _transaction 内。
    _writeKnowledgeSnapshot(messageId, conversationId, knowledgeBlock, knowledgeProvenance) {
        const hasKnowledge = typeof knowledgeBlock === 'string' && knowledgeBlock.length > 0;
        this._execute(
            `UPDATE ai_message SET knowledge_snapshot = ?, knowledge_provenance = ?
             WHERE id = ? AND conversation_id = ?`,
            [
                hasKnowledge ? knowledgeBlock : null,
                hasKnowledge && knowledgeProvenance ? JSON.stringify(knowledgeProvenance) : null,
                messageId,
                conversationId,
            ]
        );
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

    async saveProvider({ ownerKey, code, baseUrl, model, apiKeyEncrypted, supportsVision, endpointsJson }) {
        this._assertReady();
        const existing = this.getProvider(code);
        if (!existing) {
            throw new AIDatabaseError('provider_not_found', '未找到指定的 Provider。');
        }
        const visionFlag = supportsVision !== undefined
            ? (supportsVision ? 1 : 0)
            : (existing.supportsVision ? 1 : 0);
        // endpointsJson 未提供时保留现有列表（兼容直接调用 DB 的旧路径）。
        const resolvedEndpointsJson = endpointsJson !== undefined
            ? endpointsJson
            : JSON.stringify(existing.endpoints || []);

        this._transaction(() => {
            if (apiKeyEncrypted !== undefined) {
                this._execute(
                    `UPDATE ai_provider
                     SET base_url = ?, model = ?, endpoints_json = ?, api_key_enc = ?, has_key = ?, supports_vision = ?, updated_at = ?
                     WHERE code = ?`,
                    [baseUrl, model, resolvedEndpointsJson, apiKeyEncrypted, apiKeyEncrypted ? 1 : 0, visionFlag, this.now(), code]
                );
            } else {
                this._execute(
                    `UPDATE ai_provider SET base_url = ?, model = ?, endpoints_json = ?, supports_vision = ?, updated_at = ? WHERE code = ?`,
                    [baseUrl, model, resolvedEndpointsJson, visionFlag, this.now(), code]
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
                currentProviderCode: 'volcengine',
                monthlyTokenLimit: DEFAULT_MONTHLY_TOKEN_LIMIT,
                hardLimitEnabled: true,
                knowledgeSectionVisible: false,
            };
        }
        return {
            ownerKey: String(row.owner_key),
            privacyVersion: row.privacy_version == null ? null : String(row.privacy_version),
            privacyAcceptedAt: row.privacy_accepted_at == null ? null : String(row.privacy_accepted_at),
            currentProviderCode: String(row.current_provider_code),
            monthlyTokenLimit: Number(row.monthly_token_limit),
            hardLimitEnabled: Number(row.hard_limit_enabled) === 1,
            knowledgeSectionVisible: Number(row.knowledge_section_visible) === 1,
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

    async updatePreference(ownerKey, patch = {}) {
        this._assertReady();
        // allowlist：渲染层可改的偏好字段 → 列名（可扩展）。
        const ALLOWED = { knowledgeSectionVisible: 'knowledge_section_visible' };
        const sets = [];
        const values = [];
        for (const [key, value] of Object.entries(patch || {})) {
            const column = ALLOWED[key];
            if (!column) {
                continue;
            }
            sets.push(`${column} = ?`);
            values.push(value ? 1 : 0);
        }
        if (sets.length === 0) {
            return this.getPreference(ownerKey);
        }
        this._ensurePreference(ownerKey);
        sets.push('updated_at = ?');
        values.push(this.now());
        values.push(ownerKey);
        this._execute(
            `UPDATE ai_preference SET ${sets.join(', ')} WHERE owner_key = ?`,
            values
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

    // 从指定的 user 消息（含）起截断会话尾部：删除该消息及其后的所有消息（助手回复等），
    // 将被删 user 消息上的 attached 附件标记为 orphaned（保留行审计）并返回其相对路径供
    // service 层清理文件；同时清除这些消息的 ai_tool_call 审计行（无 FK 级联）。
    // 用于「编辑并重发最近一条消息」：截断后再由 startChat 重建一对全新消息。
    async deleteMessagesFrom(ownerKey, conversationId, fromMessageId) {
        this._assertReady();
        const orphaned = this._transaction(() => {
            const owned = this._queryOne(
                'SELECT 1 FROM ai_conversation WHERE id = ? AND owner_key = ?',
                [conversationId, ownerKey]
            );
            if (!owned) {
                throw new AIDatabaseError('conversation_not_found', '未找到指定的会话。');
            }
            const anchor = this._queryOne(
                'SELECT rowid AS r, role FROM ai_message WHERE id = ? AND conversation_id = ?',
                [fromMessageId, conversationId]
            );
            if (!anchor) {
                throw new AIDatabaseError('message_not_found', '未找到指定的消息。');
            }
            if (String(anchor.role) !== 'user') {
                throw new AIDatabaseError('invalid_input', '只能从用户消息开始重新发送。');
            }
            const doomedRows = this._query(
                'SELECT id FROM ai_message WHERE conversation_id = ? AND rowid >= ?',
                [conversationId, anchor.r]
            );
            const doomedIds = doomedRows.map((row) => String(row.id));
            if (doomedIds.length === 0) {
                return [];
            }
            const doomedPlaceholders = doomedIds.map(() => '?').join(', ');

            // 被截断消息上的 attached 附件 → orphaned（保留行审计），返回路径供清理文件。
            const orphanAttachments = this._query(
                `SELECT id, relative_path FROM ai_attachment
                 WHERE conversation_id = ? AND status = 'attached' AND message_id IN (${doomedPlaceholders})`,
                [conversationId, ...doomedIds]
            ).map((row) => ({ id: String(row.id), relativePath: String(row.relative_path) }));
            if (orphanAttachments.length > 0) {
                const orphanPlaceholders = orphanAttachments.map(() => '?').join(', ');
                this._execute(
                    `UPDATE ai_attachment SET status = 'orphaned', message_id = NULL, updated_at = ?
                     WHERE id IN (${orphanPlaceholders})`,
                    [this.now(), ...orphanAttachments.map((item) => item.id)]
                );
            }

            // 工具调用审计无 message FK，随消息删除避免悬挂。
            this._execute(
                `DELETE FROM ai_tool_call WHERE message_id IN (${doomedPlaceholders})`,
                doomedIds
            );

            this._execute(
                `DELETE FROM ai_message WHERE conversation_id = ? AND id IN (${doomedPlaceholders})`,
                [conversationId, ...doomedIds]
            );
            return orphanAttachments;
        });
        await this._commitMutation();
        return orphaned;
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

    async completeAssistantMessage(ownerKey, conversationId, messageId, content, usage, knowledgeBlock = null, knowledgeProvenance = null) {
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
            this._writeKnowledgeSnapshot(messageId, conversationId, knowledgeBlock, knowledgeProvenance);
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

    async failAssistantMessage(ownerKey, conversationId, messageId, status, errorKind, partialContent = '', knowledgeBlock = null, knowledgeProvenance = null) {
        this._assertReady();
        if (status !== 'error' && status !== 'cancelled') {
            throw new AIDatabaseError('invalid_message_status', '回复消息状态无效。');
        }
        const changed = this._transaction(() => {
            const updated = this._execute(
                `UPDATE ai_message
                 SET content = ?, status = ?, error_kind = ?, updated_at = ?
                 WHERE id = ? AND conversation_id = ? AND role = 'assistant' AND status = 'pending'
                   AND EXISTS (
                       SELECT 1 FROM ai_conversation c
                       WHERE c.id = ai_message.conversation_id AND c.owner_key = ?
                   )`,
                [partialContent, status, errorKind, this.now(), messageId, conversationId, ownerKey]
            );
            if (!updated) {
                return false;
            }
            this._writeKnowledgeSnapshot(messageId, conversationId, knowledgeBlock, knowledgeProvenance);
            return true;
        });
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
            knowledge: this.getKnowledgeSummaryForBootstrap(),
            preference: {
                currentProviderCode: preference.currentProviderCode,
                monthlyTokenLimit: preference.monthlyTokenLimit,
                hardLimitEnabled: preference.hardLimitEnabled,
                knowledgeSectionVisible: preference.knowledgeSectionVisible,
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
