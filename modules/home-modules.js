(function (globalScope) {
    const BASE_MODULES = [
        { name: '感知觉统合领域', color: '#FA8278', entryType: 'domain' },
        { name: '执行功能领域', color: '#08C4EB', entryType: 'domain' },
        { name: '社交沟通领域', color: '#CCDF5E', entryType: 'domain' },
        { name: '生活适应领域', color: '#0FD4C2', entryType: 'domain' },
        { name: '情绪行为领域', color: '#FFCB3A', entryType: 'domain' },
    ];

    const OPTIONAL_MODULES = {
        psy: { name: 'AI 心理测验', color: '#DF99F0', entryType: 'psy' },
        iep: { name: '综合测评领域', color: '#7EA7FF', entryType: 'iep' },
    };

    function normalizeSelectedModule(selectedModule) {
        if (selectedModule === 'psy' || selectedModule === 'iep' || selectedModule === 'none') {
            return selectedModule;
        }

        return 'none';
    }

    function buildModulesData(selectedModule) {
        const normalizedSelectedModule = normalizeSelectedModule(selectedModule);
        const modules = BASE_MODULES.map((module) => ({ ...module }));
        const optionalModule = OPTIONAL_MODULES[normalizedSelectedModule];

        if (optionalModule) {
            modules.push({ ...optionalModule });
        }

        return modules;
    }

    const api = {
        buildModulesData,
        normalizeSelectedModule,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    globalScope.homeModules = api;
})(typeof window !== 'undefined' ? window : globalThis);
