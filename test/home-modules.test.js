const { buildModulesData } = require('../modules/home-modules');

describe('home modules composition', () => {
    test('should show AI 心理测评 when selected module is psy', () => {
        const modules = buildModulesData('psy');
        const names = modules.map((item) => item.name);

        expect(names).toContain('AI 心理测评');
        expect(names).not.toContain('综合测评领域');
        expect(modules[modules.length - 1]).toMatchObject({
            key: 'psy',
            name: 'AI 心理测评',
        });
    });

    test('should show 综合测评领域 when selected module is iep', () => {
        const modules = buildModulesData('iep');
        const names = modules.map((item) => item.name);

        expect(names).toContain('综合测评领域');
        expect(names).not.toContain('AI 心理测评');
        expect(modules[modules.length - 1]).toMatchObject({
            key: 'iep',
            name: '综合测评领域',
        });
    });

    test('should hide both optional modules when selected module is none', () => {
        const modules = buildModulesData('none');
        const names = modules.map((item) => item.name);

        expect(modules).toHaveLength(5);
        expect(names).not.toContain('综合测评领域');
        expect(names).not.toContain('AI 心理测评');
    });

    test('should apply custom names to base and optional modules', () => {
        const modules = buildModulesData('psy', {
            sensoryIntegration: '感统训练中心',
            executiveFunction: '执行支持中心',
            socialCommunication: '社交沟通中心',
            adaptiveLiving: '生活适应中心',
            emotionalBehavior: '情绪行为中心',
            iep: '综合评估中心',
            psy: 'AI心理测评',
        });

        expect(modules[0]).toMatchObject({
            key: 'sensoryIntegration',
            name: '感统训练中心',
        });
        expect(modules[modules.length - 1]).toMatchObject({
            key: 'psy',
            name: 'AI心理测评',
        });
    });
});
