const {
    BUILTIN_KNOWLEDGE_SKILLS,
    getBuiltinKnowledgeSkills,
    getBuiltinKnowledgeSkill,
    getBuiltinKnowledgeReference,
} = require('../modules/ai-skill-catalog');

const EXPECTED_VERSIONS = {
    'special-education-teacher': '2.0.0',
    'speech-therapist': '2.0.0',
    'developmental-screening-assessment': '2.0.0',
    'inclusive-training-adaptation': '1.1.0',
    'montessori-teacher': '2.0.0',
    'child-adolescent-mental-health-support': '1.1.0',
    '家校沟通话术官': '2.0.0',
};

const EXPECTED_REFERENCE_COUNTS = {
    'special-education-teacher': 3,
    'speech-therapist': 3,
    'developmental-screening-assessment': 3,
    'inclusive-training-adaptation': 1,
    'montessori-teacher': 2,
    'child-adolescent-mental-health-support': 2,
    '家校沟通话术官': 0,
};

describe('builtin knowledge skill catalog', () => {
    test('exposes seven knowledge skills and fourteen references', () => {
        const skills = getBuiltinKnowledgeSkills();
        expect(skills).toHaveLength(7);
        expect(Object.keys(EXPECTED_VERSIONS)).toHaveLength(7);
        const codes = skills.map((skill) => skill.code);
        expect(codes.sort()).toEqual(Object.keys(EXPECTED_VERSIONS).sort());

        const totalReferences = skills.reduce((total, skill) => total + skill.references.length, 0);
        expect(totalReferences).toBe(14);
    });

    test('keeps each skill contentVersion aligned with the source frontmatter', () => {
        for (const skill of getBuiltinKnowledgeSkills()) {
            expect(skill.contentVersion).toBe(EXPECTED_VERSIONS[skill.code]);
            expect(EXPECTED_REFERENCE_COUNTS[skill.code]).toBe(skill.references.length);
        }
    });

    test('strips frontmatter from bodies and keeps bodies brand-neutral', () => {
        for (const skill of getBuiltinKnowledgeSkills()) {
            expect(skill.body).not.toMatch(/^---/);
            expect(skill.body.trim().length).toBeGreaterThan(0);
            // 注入正文不得包含 SCGP 品牌字样（license 元数据允许保留）。
            expect(skill.body).not.toMatch(/SCGP/);
            for (const reference of skill.references) {
                expect(reference.content).not.toMatch(/^---/);
                expect(reference.content).not.toMatch(/SCGP/);
            }
        }
    });

    test('uses stable reference ids and slug titles', () => {
        for (const skill of getBuiltinKnowledgeSkills()) {
            for (const reference of skill.references) {
                expect(reference.id).toMatch(/^references\/[^/]+$/);
                expect(reference.title).toBe(reference.id.split('/').pop());
                expect(reference.content.trim().length).toBeGreaterThan(0);
            }
        }
    });

    test('returns null for unknown codes and round-trips non-ASCII codes', () => {
        expect(getBuiltinKnowledgeSkill('does-not-exist')).toBeNull();
        const family = getBuiltinKnowledgeSkill('家校沟通话术官');
        expect(family).not.toBeNull();
        expect(family.references).toEqual([]);
    });

    test('looks up an individual reference', () => {
        const reference = getBuiltinKnowledgeReference(
            'montessori-teacher',
            'references/prepared-environment-local'
        );
        expect(reference).toEqual(
            expect.objectContaining({ title: 'prepared-environment-local' })
        );
        expect(getBuiltinKnowledgeReference('montessori-teacher', 'references/missing')).toBeNull();
    });

    test('returns defensive deep copies that cannot mutate the frozen source', () => {
        const first = getBuiltinKnowledgeSkills();
        first[0].references.push({ id: 'mutated', title: 'mutated', content: 'mutated' });
        first[0].metadata.license = 'mutated';

        const second = getBuiltinKnowledgeSkills();
        const sameCode = second.find((skill) => skill.code === first[0].code);
        expect(sameCode.references).not.toContainEqual(expect.objectContaining({ id: 'mutated' }));
        expect(sameCode.metadata.license).not.toBe('mutated');

        expect(Object.isFrozen(BUILTIN_KNOWLEDGE_SKILLS[0])).toBe(true);
        expect(Object.isFrozen(BUILTIN_KNOWLEDGE_SKILLS[0].references)).toBe(true);
        const originalCode = BUILTIN_KNOWLEDGE_SKILLS[0].code;
        BUILTIN_KNOWLEDGE_SKILLS[0].code = 'tampered'; // frozen：严格模式抛错，否则静默忽略
        expect(BUILTIN_KNOWLEDGE_SKILLS[0].code).toBe(originalCode);
    });
});
