(function (globalScope) {
    const BASE_MODULES = [
        { key: 'sensoryIntegration', defaultName: '感知觉统合领域', canonicalDomain: '感知觉统合', color: '#FA8278', entryType: 'domain' },
        { key: 'executiveFunction', defaultName: '执行功能领域', canonicalDomain: '执行功能', color: '#08C4EB', entryType: 'domain' },
        { key: 'socialCommunication', defaultName: '社交沟通领域', canonicalDomain: '社交沟通', color: '#CCDF5E', entryType: 'domain' },
        { key: 'adaptiveLiving', defaultName: '生活适应领域', canonicalDomain: '生活适应', color: '#0FD4C2', entryType: 'domain' },
        { key: 'emotionalBehavior', defaultName: '情绪行为领域', canonicalDomain: '情绪行为', color: '#FFCB3A', entryType: 'domain' },
    ];

    const OPTIONAL_MODULES = {
        psy: { key: 'psy', defaultName: 'AI 心理测评', canonicalDomain: 'AI心理测评', color: '#DF99F0', entryType: 'psy' },
        iep: { key: 'iep', defaultName: '综合测评领域', canonicalDomain: '综合测评', color: '#7EA7FF', entryType: 'iep' },
    };

    const MODULES_BY_KEY = [...BASE_MODULES, ...Object.values(OPTIONAL_MODULES)]
        .reduce((accumulator, module) => {
            accumulator[module.key] = module;
            return accumulator;
        }, {});

    function normalizeSelectedModule(selectedModule) {
        if (selectedModule === 'psy' || selectedModule === 'iep' || selectedModule === 'none') {
            return selectedModule;
        }

        return 'none';
    }

    function resolveName(module, moduleNames = {}) {
        return moduleNames[module.key] || module.defaultName;
    }

    function getAllModuleMeta(moduleNames = {}) {
        return Object.values(MODULES_BY_KEY).map((module) => ({
            ...module,
            name: resolveName(module, moduleNames),
            displayName: resolveName(module, moduleNames),
        }));
    }

    function getModuleMeta(moduleKey, moduleNames = {}) {
        const module = MODULES_BY_KEY[moduleKey];
        if (!module) {
            return null;
        }

        return {
            ...module,
            name: resolveName(module, moduleNames),
            displayName: resolveName(module, moduleNames),
        };
    }

    function resolveModuleKey(moduleKey, domain, moduleNames = {}) {
        if (moduleKey && MODULES_BY_KEY[moduleKey]) {
            return moduleKey;
        }

        if (!domain) {
            return null;
        }

        const normalizedDomain = String(domain).trim();

        const matchedModule = Object.values(MODULES_BY_KEY).find((module) => {
            const configuredName = resolveName(module, moduleNames);
            return normalizedDomain === module.defaultName
                || normalizedDomain === module.canonicalDomain
                || normalizedDomain === configuredName;
        });

        return matchedModule ? matchedModule.key : null;
    }

    function getModuleIconClass(moduleKey) {
        switch (moduleKey) {
            case 'sensoryIntegration':
                return 'fas fa-brain';
            case 'executiveFunction':
                return 'fas fa-tasks';
            case 'socialCommunication':
                return 'fas fa-users';
            case 'adaptiveLiving':
                return 'fas fa-lightbulb';
            case 'emotionalBehavior':
                return 'fas fa-grin-beam';
            case 'psy':
                return 'fas fa-heart';
            case 'iep':
                return 'fas fa-clipboard-check';
            default:
                return 'fas fa-compass';
        }
    }

    function buildModulesData(selectedModule, moduleNames = {}) {
        const normalizedSelectedModule = normalizeSelectedModule(selectedModule);
        const modules = BASE_MODULES.map((module) => ({
            ...module,
            name: resolveName(module, moduleNames),
        }));
        const optionalModule = OPTIONAL_MODULES[normalizedSelectedModule];

        if (optionalModule) {
            modules.push({
                ...optionalModule,
                name: resolveName(optionalModule, moduleNames),
            });
        }

        return modules;
    }

    const api = {
        BASE_MODULES,
        OPTIONAL_MODULES,
        MODULES_BY_KEY,
        buildModulesData,
        getAllModuleMeta,
        getModuleMeta,
        resolveModuleKey,
        getModuleIconClass,
        normalizeSelectedModule,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    globalScope.homeModules = api;
})(typeof window !== 'undefined' ? window : globalThis);
