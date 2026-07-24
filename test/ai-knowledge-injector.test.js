const {
    assembleKnowledgeBlock,
    KNOWLEDGE_HEADER,
    MAX_KNOWLEDGE_PROMPT_CHARS,
    MAX_KNOWLEDGE_SKILLS,
    MAX_KNOWLEDGE_REFERENCES,
    ASSUMED_CONTEXT_WINDOW_CHARS,
    RESERVED_HISTORY_CHARS,
} = require('../modules/ai-knowledge-injector');

function buildSkill(overrides = {}) {
    return {
        name: overrides.name || 'A',
        body: overrides.body === undefined ? '正文A' : overrides.body,
        references: overrides.references || [
            { id: 'references/r1', title: 'r1', content: '引用1' },
            { id: 'references/r2', title: 'r2', content: '引用2' },
        ],
    };
}

function providerFrom(map) {
    return (code) => map[code] || null;
}

describe('assembleKnowledgeBlock', () => {
    test('effective character cap accounts for the context window and reserved history', () => {
        const expected = Math.min(MAX_KNOWLEDGE_PROMPT_CHARS, ASSUMED_CONTEXT_WINDOW_CHARS - RESERVED_HISTORY_CHARS);
        expect(expected).toBe(80000);

        const longBody = 'x'.repeat(90000);
        const result = assembleKnowledgeBlock({
            bindings: [{ skillCode: 'A', referenceIds: null, sort: 0 }],
            skillProvider: providerFrom({ A: buildSkill({ body: longBody }) }),
        });
        expect(result.provenance.truncated).toBe(true);
        expect(result.provenance.charCap).toBe(80000);
        expect(result.provenance.injectedChars).toBeLessThanOrEqual(80000);
        expect(result.provenance.originalChars).toBeGreaterThan(result.provenance.injectedChars);
        expect(result.block.endsWith('字符]')).toBe(true);
        expect(result.block).not.toContain(KNOWLEDGE_HEADER);
    });

    test('wraps each skill and joins sections with the source separators', () => {
        const result = assembleKnowledgeBlock({
            bindings: [
                { skillCode: 'A', referenceIds: null, sort: 0 },
                { skillCode: 'B', referenceIds: [], sort: 1 },
            ],
            skillProvider: providerFrom({
                A: buildSkill({ name: 'A' }),
                B: buildSkill({ name: 'B', body: '正文B', references: [] }),
            }),
        });
        expect(result.block).toBe(
            '## 专业技能：A\n\n正文A\n\n---\n\n# r1\n\n引用1\n\n---\n\n# r2\n\n引用2'
            + '\n\n---\n\n'
            + '## 专业技能：B\n\n正文B'
        );
        expect(result.provenance.skillCodes).toEqual(['A', 'B']);
        expect(result.provenance.referenceIds).toEqual(['references/r1', 'references/r2']);
    });

    test('honors the referenceIds tri-state (all / body-only / subset)', () => {
        const provider = providerFrom({ A: buildSkill() });

        const all = assembleKnowledgeBlock({
            bindings: [{ skillCode: 'A', referenceIds: null, sort: 0 }],
            skillProvider: provider,
        });
        expect(all.provenance.referenceIds).toEqual(['references/r1', 'references/r2']);

        const bodyOnly = assembleKnowledgeBlock({
            bindings: [{ skillCode: 'A', referenceIds: [], sort: 0 }],
            skillProvider: provider,
        });
        expect(bodyOnly.block).toBe('## 专业技能：A\n\n正文A');
        expect(bodyOnly.provenance.referenceIds).toEqual([]);

        const subset = assembleKnowledgeBlock({
            bindings: [{ skillCode: 'A', referenceIds: ['references/r2'], sort: 0 }],
            skillProvider: provider,
        });
        expect(subset.block).toBe('## 专业技能：A\n\n正文A\n\n---\n\n# r2\n\n引用2');
        expect(subset.provenance.referenceIds).toEqual(['references/r2']);
    });

    test('caps the number of injected skills per agent', () => {
        const map = {};
        const bindings = [];
        for (let index = 0; index < MAX_KNOWLEDGE_SKILLS + 2; index += 1) {
            const code = `skill-${index}`;
            map[code] = buildSkill({ name: code, body: `正文${index}` });
            bindings.push({ skillCode: code, referenceIds: [], sort: index });
        }
        const result = assembleKnowledgeBlock({
            bindings,
            skillProvider: providerFrom(map),
        });
        expect(result.provenance.skillsCapped).toBe(true);
        expect(result.provenance.skillCodes).toHaveLength(MAX_KNOWLEDGE_SKILLS);
    });

    test('caps the total number of injected references per agent', () => {
        const references = [];
        for (let index = 0; index < MAX_KNOWLEDGE_REFERENCES + 5; index += 1) {
            references.push({ id: `references/r${index}`, title: `r${index}`, content: `内容${index}` });
        }
        const result = assembleKnowledgeBlock({
            bindings: [{ skillCode: 'A', referenceIds: null, sort: 0 }],
            skillProvider: providerFrom({ A: buildSkill({ references }) }),
        });
        expect(result.provenance.refsCapped).toBe(true);
        expect(result.provenance.referenceIds).toHaveLength(MAX_KNOWLEDGE_REFERENCES);
    });

    test('returns an empty block when no skill contributes content', () => {
        const result = assembleKnowledgeBlock({
            bindings: [{ skillCode: 'missing', referenceIds: null, sort: 0 }],
            skillProvider: providerFrom({}),
        });
        expect(result.block).toBe('');
        expect(result.provenance.skillCodes).toEqual([]);
        expect(result.provenance.truncated).toBe(false);
    });

    test('respects explicit cap overrides', () => {
        const result = assembleKnowledgeBlock({
            bindings: [{ skillCode: 'A', referenceIds: null, sort: 0 }],
            skillProvider: providerFrom({ A: buildSkill({ body: 'x'.repeat(300) }) }),
            caps: { maxPromptChars: 80, assumedContextWindowChars: 80, reservedHistoryChars: 0 },
        });
        expect(result.provenance.charCap).toBe(80);
        expect(result.provenance.truncated).toBe(true);
    });
});
