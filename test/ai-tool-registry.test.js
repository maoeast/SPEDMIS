const {
    AI_TOOLS,
    ALLOWED_TOOL_NAMES,
    MAX_TOOL_ROUNDS,
    dispatchTool,
    serializeToolResult,
    failToolResult,
    clampLimit,
} = require('../modules/ai-tool-registry');

const APPS_CATALOG = {
    APP001: { 领域: '感知觉统合', 子功能: '感觉刺激', 应用名称: '奇妙的声音', 应用路径: 'flash/XC001.exe', 图标路径: 'icons/APP001.png' },
    APP002: { 领域: '执行功能', 子功能: '工作记忆', 应用名称: '记忆游戏', 应用路径: 'flash/XC002.exe', 图标路径: 'icons/APP002.png' },
    APP003: { 领域: '感知觉统合', 子功能: '前庭', 应用名称: '平衡训练', 应用路径: 'flash/XC003.exe', 图标路径: 'icons/APP003.png' },
};

describe('ai-tool-registry definitions', () => {
    test('exposes exactly the two read-only tools', () => {
        expect(AI_TOOLS).toHaveLength(2);
        expect(AI_TOOLS.map((tool) => tool.function.name).sort()).toEqual(['query_usage_stats', 'search_intervention_apps']);
        expect(ALLOWED_TOOL_NAMES.has('search_intervention_apps')).toBe(true);
        expect(MAX_TOOL_ROUNDS).toBe(4);
        for (const tool of AI_TOOLS) {
            expect(tool.type).toBe('function');
            expect(tool.function.parameters.type).toBe('object');
        }
    });

    test('serializeToolResult truncates over the char cap with a marker', () => {
        const big = { rows: ['x'.repeat(20000)] };
        const result = serializeToolResult(big);
        expect(result.ok).toBe(true);
        expect(result.status).toBe('success');
        expect(result.content.length).toBeLessThanOrEqual(7000);
        expect(result.content).toMatch(/结果已截断/);
    });

    test('clampLimit bounds positive integers and falls back', () => {
        expect(clampLimit(5, 20, 50)).toBe(5);
        expect(clampLimit(999, 20, 50)).toBe(50);
        expect(clampLimit(0, 20, 50)).toBe(20);
        expect(clampLimit('nope', 20, 50)).toBe(20);
        expect(clampLimit(undefined, 30, 365)).toBe(30);
    });

    test('failToolResult produces a structured error payload', () => {
        const result = failToolResult('boom', 'rejected');
        expect(result.ok).toBe(false);
        expect(result.status).toBe('rejected');
        expect(JSON.parse(result.content).message).toBe('boom');
    });
});

describe('dispatchTool safety envelope', () => {
    test('rejects an unknown tool name', async () => {
        const result = await dispatchTool('launch_virus', '{}', {});
        expect(result.ok).toBe(false);
        expect(result.status).toBe('rejected');
    });

    test('rejects malformed arguments JSON', async () => {
        const result = await dispatchTool('search_intervention_apps', '{bad', { appsCatalog: APPS_CATALOG });
        expect(result.ok).toBe(false);
        expect(result.status).toBe('rejected');
    });

    test('rejects an unknown parameter key', async () => {
        const result = await dispatchTool('search_intervention_apps', JSON.stringify({ evil: 'x' }), { appsCatalog: APPS_CATALOG });
        expect(result.ok).toBe(false);
        expect(result.status).toBe('rejected');
    });
});

describe('search_intervention_apps', () => {
    test('strips disk and icon paths from every returned row', async () => {
        const result = await dispatchTool('search_intervention_apps', JSON.stringify({ domain: '感知觉统合' }), { appsCatalog: APPS_CATALOG });
        expect(result.ok).toBe(true);
        const parsed = JSON.parse(result.content);
        expect(parsed.total).toBe(2);
        for (const app of parsed.apps) {
            expect(Object.keys(app).sort()).toEqual(['domain', 'name', 'subcategory']);
        }
        expect(result.content).not.toContain('应用路径');
        expect(result.content).not.toContain('图标路径');
        expect(result.content).not.toContain('XC001');
    });

    test('filters by subcategory and keyword and respects the limit', async () => {
        const bySub = await dispatchTool('search_intervention_apps', JSON.stringify({ subcategory: '感觉刺激' }), { appsCatalog: APPS_CATALOG });
        expect(JSON.parse(bySub.content).total).toBe(1);

        const byKeyword = await dispatchTool('search_intervention_apps', JSON.stringify({ keyword: '训练' }), { appsCatalog: APPS_CATALOG });
        expect(JSON.parse(byKeyword.content).total).toBe(1);

        const limited = await dispatchTool('search_intervention_apps', JSON.stringify({ limit: 1 }), { appsCatalog: APPS_CATALOG });
        const parsed = JSON.parse(limited.content);
        expect(parsed.returned).toBe(1);
        expect(parsed.total).toBe(3);
    });
});

describe('query_usage_stats', () => {
    test('calls the usage-stats module directly and returns aggregates only', async () => {
        const usageStatsModule = {
            getUsageStats: jest.fn(async () => [
                { app_name: 'A', usage_count: 3, total_duration_sec: 120, avg_duration_sec: 40, last_used: 't', first_used: 't', app_path: 'LEAK' },
            ]),
            getCategoryStats: jest.fn(async () => []),
        };
        const result = await dispatchTool('query_usage_stats', JSON.stringify({ metric: 'by_app', limit_days: 7 }), { usageStatsModule });
        expect(result.ok).toBe(true);
        expect(usageStatsModule.getUsageStats).toHaveBeenCalledWith({ limitDays: 7 });
        const parsed = JSON.parse(result.content);
        expect(parsed.rows[0]).toEqual(
            expect.objectContaining({ app_name: 'A', usage_count: 3, total_duration_sec: 120 })
        );
        expect(result.content).not.toContain('LEAK');
        expect(result.content).not.toContain('app_path');
    });

    test('routes by_category to getCategoryStats', async () => {
        const usageStatsModule = {
            getUsageStats: jest.fn(async () => []),
            getCategoryStats: jest.fn(async () => [{ category: '感知觉统合', usage_count: 5, app_count: 2, total_duration_ms: 5000 }]),
        };
        const result = await dispatchTool('query_usage_stats', JSON.stringify({ metric: 'by_category' }), { usageStatsModule });
        expect(usageStatsModule.getCategoryStats).toHaveBeenCalled();
        expect(usageStatsModule.getUsageStats).not.toHaveBeenCalled();
        const parsed = JSON.parse(result.content);
        expect(parsed.rows[0]).toEqual(expect.objectContaining({ category: '感知觉统合', total_duration_sec: 5 }));
    });

    test('returns a timeout status when the handler exceeds the cap', async () => {
        jest.useFakeTimers();
        const usageStatsModule = {
            getUsageStats: async () => new Promise(() => {}),
            getCategoryStats: async () => [],
        };
        const pending = dispatchTool('query_usage_stats', JSON.stringify({ metric: 'by_app' }), { usageStatsModule }, new AbortController().signal);
        await jest.advanceTimersByTimeAsync(9000);
        const result = await pending;
        expect(result.ok).toBe(false);
        expect(result.status).toBe('timeout');
        jest.useRealTimers();
    });

    test('propagates an already-aborted signal', async () => {
        const usageStatsModule = {
            getUsageStats: async () => new Promise(() => {}),
            getCategoryStats: async () => [],
        };
        const controller = new AbortController();
        controller.abort();
        await expect(
            dispatchTool('query_usage_stats', JSON.stringify({ metric: 'by_app' }), { usageStatsModule }, controller.signal)
        ).rejects.toThrow();
    });
});
