'use strict';

// SPEDMIS 只读工具注册表与派发器（Phase 3a）。移植 SIC-ADS ai-tools.ts 的域规则，
// 但：① 工具在 Main 执行（ai-service 注入 context）；② 加 JSON-schema 参数校验
// （ai-tool-validator）；③ 加逐工具 Promise.race 超时；④ 结果回注前由 service 包裹
// <tool_result>；⑤ 显式字段投影——工具 1 剥离 应用路径/图标路径，工具 2 仅返回聚合。
//
// 仅 2 个只读工具，故 MAX_TOOL_ROUNDS=4（源 8 工具用 7）。

const { validateArguments } = require('./ai-tool-validator');

const MAX_RESULT_CHARS = 6000;
const TOOL_TIMEOUT_MS = 8000;
const MAX_TOOL_ROUNDS = 4;

const SEARCH_INTERVENTION_APPS = Object.freeze({
    type: 'function',
    function: Object.freeze({
        name: 'search_intervention_apps',
        description: '查询 SPEDMIS 可用的干预应用目录。可按领域、子功能分类或应用名称关键词筛选。返回每个应用的名称、领域、子功能，不返回磁盘路径或图标路径。用于回答「有哪些训练应用」「某领域有什么软件」「感觉统合领域有哪些应用」等问题。',
        parameters: Object.freeze({
            type: 'object',
            properties: Object.freeze({
                domain: Object.freeze({
                    type: 'string',
                    enum: Object.freeze(['感知觉统合', '执行功能', '社交沟通', '生活适应', '情绪行为']),
                    description: '按领域过滤',
                }),
                subcategory: Object.freeze({ type: 'string', maxLength: 40, description: '按子功能分类精确匹配' }),
                keyword: Object.freeze({ type: 'string', maxLength: 40, description: '按应用名称模糊搜索' }),
                limit: Object.freeze({ type: 'integer', minimum: 1, maximum: 50, description: '返回上限，默认 20，最大 50' }),
            }),
        }),
    }),
});

const QUERY_USAGE_STATS = Object.freeze({
    type: 'function',
    function: Object.freeze({
        name: 'query_usage_stats',
        description: '查询 SPEDMIS 干预应用的聚合使用统计。可按应用维度或分类维度汇总，返回使用次数、总时长（秒）、平均时长、最近/最早使用时间。仅返回聚合汇总，不返回可识别明细、用户身份、行级记录或应用路径。',
        parameters: Object.freeze({
            type: 'object',
            properties: Object.freeze({
                metric: Object.freeze({
                    type: 'string',
                    enum: Object.freeze(['by_app', 'by_category']),
                    description: '汇总维度：by_app=按应用名，by_category=按分类',
                }),
                limit_days: Object.freeze({ type: 'integer', minimum: 1, maximum: 365, description: '统计窗口天数，默认 30，最大 365' }),
                limit: Object.freeze({ type: 'integer', minimum: 1, maximum: 50, description: '返回条目上限，默认 20，最大 50' }),
            }),
        }),
    }),
});

const AI_TOOLS = Object.freeze([SEARCH_INTERVENTION_APPS, QUERY_USAGE_STATS]);
const ALLOWED_TOOL_NAMES = Object.freeze(new Set(AI_TOOLS.map((tool) => tool.function.name)));
const TOOL_BY_NAME = new Map(AI_TOOLS.map((tool) => [tool.function.name, tool]));

function serializeToolResult(data) {
    const json = JSON.stringify(data, null, 2);
    if (json.length > MAX_RESULT_CHARS) {
        const content = json.slice(0, MAX_RESULT_CHARS) + `\n...[结果已截断，原始长度 ${json.length} 字符]`;
        return { ok: true, content, status: 'success', resultSize: content.length };
    }
    return { ok: true, content: json, status: 'success', resultSize: json.length };
}

function failToolResult(message, status = 'error', extra) {
    const payload = Object.assign({ error: true, message }, extra || {});
    const content = JSON.stringify(payload);
    return { ok: false, content, status, resultSize: content.length };
}

function clampLimit(raw, fallback, maximum) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return Math.min(Math.floor(value), maximum);
}

function runSearchInterventionApps(args, context) {
    const catalog = (context && context.appsCatalog) || {};
    const entries = Object.values(catalog).filter((entry) => entry && typeof entry === 'object');
    const filtered = entries.filter((entry) => {
        if (args.domain && entry['领域'] !== args.domain) {
            return false;
        }
        if (args.subcategory && entry['子功能'] !== args.subcategory) {
            return false;
        }
        if (args.keyword && !String(entry['应用名称'] || '').includes(args.keyword)) {
            return false;
        }
        return true;
    });
    const limit = clampLimit(args.limit, 20, 50);
    // 显式字段投影：剥离 应用路径 / 图标路径。
    const apps = filtered.slice(0, limit).map((entry) => ({
        name: entry['应用名称'],
        domain: entry['领域'],
        subcategory: entry['子功能'],
    }));
    return { total: filtered.length, returned: apps.length, apps };
}

function projectUsageRow(metric, row) {
    const totalSec = Number(row.total_duration_sec != null
        ? row.total_duration_sec
        : Math.round((Number(row.total_duration_ms) || 0) / 1000));
    if (metric === 'by_category') {
        return {
            category: row.category,
            usage_count: Number(row.usage_count || 0),
            app_count: Number(row.app_count || 0),
            total_duration_sec: totalSec,
        };
    }
    const avgSec = Number(row.avg_duration_sec != null
        ? row.avg_duration_sec
        : Math.round((Number(row.avg_duration_ms) || 0) / 1000));
    return {
        app_name: row.app_name,
        usage_count: Number(row.usage_count || 0),
        total_duration_sec: totalSec,
        avg_duration_sec: avgSec,
        last_used: row.last_used || null,
        first_used: row.first_used || null,
    };
}

async function runQueryUsageStats(args, context) {
    const usageStats = context && context.usageStatsModule;
    if (!usageStats || typeof usageStats.getUsageStats !== 'function') {
        return { error: true, message: '使用统计模块不可用。' };
    }
    const metric = args.metric === 'by_category' ? 'by_category' : 'by_app';
    const limitDays = clampLimit(args.limit_days, 30, 365);
    const limit = clampLimit(args.limit, 20, 50);
    const filters = { limitDays };
    // Main 直调模块（不经其无门禁 IPC）；两者本就只返回聚合。
    const rawRows = metric === 'by_category' && typeof usageStats.getCategoryStats === 'function'
        ? await usageStats.getCategoryStats(filters)
        : await usageStats.getUsageStats(filters);
    const rows = (Array.isArray(rawRows) ? rawRows : []).slice(0, limit).map((row) => projectUsageRow(metric, row));
    return { metric, limit_days: limitDays, returned: rows.length, rows };
}

function raceWithTimeoutAndAbort(promise, timeoutMs, signal) {
    let timeoutId;
    let onAbort;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            const error = new Error('tool timeout');
            error.name = 'ToolTimeout';
            reject(error);
        }, timeoutMs);
    });
    const abort = new Promise((_, reject) => {
        if (signal && signal.aborted) {
            const error = new Error('tool aborted');
            error.name = 'ToolAbort';
            reject(error);
        } else if (signal) {
            onAbort = () => {
                const error = new Error('tool aborted');
                error.name = 'ToolAbort';
                reject(error);
            };
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
    return Promise.race([promise, timeout, abort]).finally(() => {
        clearTimeout(timeoutId);
        if (signal && onAbort) {
            signal.removeEventListener('abort', onAbort);
        }
    });
}

async function dispatchTool(name, argsJson, context, signal) {
    if (!ALLOWED_TOOL_NAMES.has(name)) {
        return failToolResult(`未知或未挂载工具：${name}`, 'rejected');
    }
    const toolDef = TOOL_BY_NAME.get(name);
    const validation = validateArguments(argsJson, toolDef.function.parameters);
    if (!validation.ok) {
        return failToolResult(`参数校验失败：${validation.errors.join('；')}`, 'rejected');
    }
    const args = validation.value;

    const run = () => (name === 'search_intervention_apps'
        ? runSearchInterventionApps(args, context)
        : runQueryUsageStats(args, context));

    try {
        const data = await raceWithTimeoutAndAbort(run(), TOOL_TIMEOUT_MS, signal);
        return serializeToolResult(data);
    } catch (error) {
        if (signal && signal.aborted) {
            throw error; // 聊天已中止，向上传播（让循环以 cancelled 结束）
        }
        if (error && error.name === 'ToolTimeout') {
            return failToolResult(`工具 ${name} 执行超时。`, 'timeout');
        }
        return failToolResult(`工具 ${name} 执行出错：${error && error.message ? error.message : String(error)}`, 'error');
    }
}

module.exports = {
    AI_TOOLS,
    ALLOWED_TOOL_NAMES,
    MAX_TOOL_ROUNDS,
    TOOL_TIMEOUT_MS,
    MAX_RESULT_CHARS,
    serializeToolResult,
    failToolResult,
    clampLimit,
    dispatchTool,
};
