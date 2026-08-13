'use strict';

// 内置知识技能数据模块（Phase 2：知识与智能体治理）。
//
// 正文由一次性生成脚本（tools/gen-skill-catalog.cjs，已随 Phase 2 归档删除）
// 从 SIC-ADS 源项目读取生成，存为 ai-skill-catalog.json（随包发布；
// package.json build.files 的 `!**/*.md` 禁止 .md 出货，故以 JSON 数据模块
// 形式内联，与 modules/ai-agent-catalog.js 的「打包数据模块」思路一致）。
//
// 本模块只做冻结与防御性深拷贝，供 ai-database.js 做幂等同步、ai-service.js
// 注入使用。每技能的 contentVersion 取自源 frontmatter 的 version 字段
// （源 loader 会丢弃它；SPEDMIS 用它做 ai-database.js 的版本门控升级）。

const RAW = require('./ai-skill-catalog.json');

const BUILTIN_KNOWLEDGE_SKILLS = RAW.skills.map((skill) => Object.freeze({
    code: skill.code,
    name: skill.name,
    contentVersion: skill.contentVersion,
    description: skill.description,
    body: skill.body,
    references: Object.freeze(
        skill.references.map((reference) => Object.freeze({
            id: reference.id,
            title: reference.title,
            content: reference.content,
        }))
    ),
    metadata: Object.freeze({
        sourceType: skill.metadata.sourceType,
        sourceUrl: skill.metadata.sourceUrl,
        license: skill.metadata.license,
        evidenceLevel: skill.metadata.evidenceLevel,
        riskLevel: skill.metadata.riskLevel,
        audience: skill.metadata.audience,
    }),
}));

const SKILL_BY_CODE = new Map(BUILTIN_KNOWLEDGE_SKILLS.map((skill) => [skill.code, skill]));

function cloneSkill(skill) {
    return {
        code: skill.code,
        name: skill.name,
        contentVersion: skill.contentVersion,
        description: skill.description,
        body: skill.body,
        references: skill.references.map((reference) => ({
            id: reference.id,
            title: reference.title,
            content: reference.content,
        })),
        metadata: { ...skill.metadata },
    };
}

function getBuiltinKnowledgeSkills() {
    return BUILTIN_KNOWLEDGE_SKILLS.map(cloneSkill);
}

function getBuiltinKnowledgeSkill(code) {
    const skill = SKILL_BY_CODE.get(code);
    return skill ? cloneSkill(skill) : null;
}

function getBuiltinKnowledgeReference(skillCode, referenceId) {
    const skill = SKILL_BY_CODE.get(skillCode);
    if (!skill) {
        return null;
    }
    const reference = skill.references.find((item) => item.id === referenceId);
    return reference ? { ...reference } : null;
}

module.exports = {
    BUILTIN_KNOWLEDGE_SKILLS,
    getBuiltinKnowledgeSkills,
    getBuiltinKnowledgeSkill,
    getBuiltinKnowledgeReference,
};
