const { getBuiltinAgents } = require('../modules/ai-agent-catalog');

describe('AI built-in agent catalog', () => {
    test('contains the five stable teacher-facing agents', () => {
        const agents = getBuiltinAgents();
        expect(agents.map((agent) => agent.code)).toEqual([
            'special_ed_teacher',
            'scgp_builtin_communication_support',
            'scgp_builtin_growth_observer',
            'scgp_builtin_family_communication',
            'scgp_builtin_wellbeing_support',
        ]);
    });

    test('removes the old product brand and unavailable Phase 1 capabilities from prompts', () => {
        const promptText = getBuiltinAgents().map((agent) => agent.systemPrompt).join('\n');

        expect(promptText).not.toMatch(/SCGP/i);
        expect(promptText).not.toMatch(/search_students|get_assessment|list_training_sessions|generate_report/);
        expect(promptText).toContain('不能调用本地工具');
        expect(promptText).toContain('不作医学、心理或教育诊断');
        expect(promptText).toContain('启动学校既有危机处置');
    });

    test('returns defensive copies of mutable agent metadata', () => {
        const first = getBuiltinAgents();
        first[0].starterPrompts.push('mutated');

        expect(getBuiltinAgents()[0].starterPrompts).not.toContain('mutated');
    });
});
