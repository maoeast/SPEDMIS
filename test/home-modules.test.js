const { buildModulesData } = require('../modules/home-modules');

describe('home modules composition', () => {
    test('should show AI心理测验 when selected module is psy', () => {
        const modules = buildModulesData('psy');
        const names = modules.map((item) => item.name);

        expect(names).toContain('AI 心理测验');
        expect(names).not.toContain('综合测评领域');
        expect(names[names.length - 1]).toBe('AI 心理测验');
    });

    test('should show 综合测评领域 when selected module is iep', () => {
        const modules = buildModulesData('iep');
        const names = modules.map((item) => item.name);

        expect(names).toContain('综合测评领域');
        expect(names).not.toContain('AI 心理测验');
        expect(names[names.length - 1]).toBe('综合测评领域');
    });

    test('should hide both optional modules when selected module is none', () => {
        const modules = buildModulesData('none');
        const names = modules.map((item) => item.name);

        expect(modules).toHaveLength(5);
        expect(names).not.toContain('综合测评领域');
        expect(names).not.toContain('AI 心理测验');
    });
});
