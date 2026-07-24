'use strict';

// 内置「智能体 → 知识技能」绑定 seed（Phase 2：知识与智能体治理）。
//
// 逐字移植自 SIC-ADS src/data/ai-agent-presets.ts 各 preset 的 knowledgeSkills
// 字段。referenceIds 三态语义（与源一致）：
//   - null  ：注入该技能全部引用（seed 不使用，保留以支持自定义绑定）
//   - []    ：仅注入技能正文，不注入任何引用
//   - [...] ：仅注入列出的引用
//
// ai-database.js 的 _syncAgentSkills 用 INSERT ... ON CONFLICT DO NOTHING 写入，
// 因此用户对内置绑定的微调（停用 / 改 referenceIds）跨重启存活；需要恢复 seed
// 时由治理层的 resetBuiltinAgentBindings 处理。每条的 sort 决定注入顺序。

const BUILTIN_AGENT_SKILL_BINDINGS = Object.freeze([
    // special_ed_teacher（一人一策 / 个别化教学专家）
    {
        agentCode: 'special_ed_teacher',
        skillCode: 'special-education-teacher',
        referenceIds: Object.freeze([
            'references/domestic-school-workflow',
            'references/individualized-support-template',
            'references/classroom-behavior-support',
        ]),
        sort: 0,
    },
    {
        agentCode: 'special_ed_teacher',
        skillCode: 'inclusive-training-adaptation',
        referenceIds: Object.freeze(['references/adaptation-checklist']),
        sort: 1,
    },
    {
        agentCode: 'special_ed_teacher',
        skillCode: 'montessori-teacher',
        referenceIds: Object.freeze([
            'references/prepared-environment-local',
            'references/observation-and-presentation',
        ]),
        sort: 2,
    },

    // scgp_builtin_communication_support（沟通有方 / 课堂沟通支持专家）
    {
        agentCode: 'scgp_builtin_communication_support',
        skillCode: 'speech-therapist',
        referenceIds: Object.freeze([
            'references/classroom-communication-support',
            'references/observation-and-referral',
            'references/family-collaboration',
        ]),
        sort: 0,
    },
    {
        agentCode: 'scgp_builtin_communication_support',
        skillCode: 'inclusive-training-adaptation',
        referenceIds: Object.freeze(['references/adaptation-checklist']),
        sort: 1,
    },

    // scgp_builtin_growth_observer（成长看得见 / 成长观察助手）
    {
        agentCode: 'scgp_builtin_growth_observer',
        skillCode: 'developmental-screening-assessment',
        referenceIds: Object.freeze([
            'references/naturalistic-observation',
            'references/formal-assessment-boundaries',
            'references/support-and-referral',
        ]),
        sort: 0,
    },
    {
        agentCode: 'scgp_builtin_growth_observer',
        skillCode: 'special-education-teacher',
        referenceIds: Object.freeze([
            'references/domestic-school-workflow',
            'references/individualized-support-template',
        ]),
        sort: 1,
    },

    // scgp_builtin_family_communication（家校好好说 / 家校沟通助手）— 仅正文
    {
        agentCode: 'scgp_builtin_family_communication',
        skillCode: '家校沟通话术官',
        referenceIds: Object.freeze([]),
        sort: 0,
    },

    // scgp_builtin_wellbeing_support（心晴陪伴 / 情绪支持助手）
    {
        agentCode: 'scgp_builtin_wellbeing_support',
        skillCode: 'child-adolescent-mental-health-support',
        referenceIds: Object.freeze([
            'references/safety-boundaries',
            'references/teacher-workflow',
        ]),
        sort: 0,
    },
    {
        agentCode: 'scgp_builtin_wellbeing_support',
        skillCode: '家校沟通话术官',
        referenceIds: Object.freeze([]),
        sort: 1,
    },
]);

module.exports = {
    BUILTIN_AGENT_SKILL_BINDINGS,
};
