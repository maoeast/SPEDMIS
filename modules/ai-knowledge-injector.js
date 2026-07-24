'use strict';

// 知识注入组装点（Phase 2a）。纯函数、无副作用、全单测。
//
// 输入：某 agent 的启用绑定列表 + 技能提供器（ai-service 从 DB 读取后注入）。
// 输出：{ block, provenance }。block 是组装好的知识正文（**不含** header；header
// 由 ai-service 前置到 system prompt）。provenance 记录贡献的技能/引用与各项上限
// 命中情况，供 ai_message 快照与 UI 截断徽章使用。
//
// 组装规则与源（SIC-ADS getAgentKnowledgePrompt / buildKnowledgeSkillContent）一致：
//   - 每技能块：`## 专业技能：${name}\n\n${skillText}`；skillText 由 body 与各引用
//     用 `\n\n---\n\n` 连接；引用形如 `# ${title}\n\n${content}`。
//   - 技能之间也用 `\n\n---\n\n` 连接。
//   - 引用按技能 references 数组顺序（载入时已按 title 排序）过滤，而非按绑定
//     referenceIds 的顺序——与源一致。
//   - referenceIds 三态：null=该技能全部引用；[]=仅 body；[...]=仅列出项。
//
// 上限（§7 要求的硬上限；源仅有 120000 字符上限）：
//   - MAX_KNOWLEDGE_PROMPT_CHARS（源值，~30k token）
//   - MAX_KNOWLEDGE_SKILLS / MAX_KNOWLEDGE_REFERENCES（每 agent 技能/引用数上限，新增）
//   - 上下文 token 感知：有效字符上限 = min(MAX_KNOWLEDGE_PROMPT_CHARS,
//     ASSUMED_CONTEXT_WINDOW_CHARS - RESERVED_HISTORY_CHARS)，为历史与输出预留空间。
//   - 截断时保留尾巴长度，使最终 block.length 不超过有效上限，并追加结构化标记
//     （源只在字符串里留 marker；SPEDMIS 另在 provenance.truncated 暴露布尔标记）。

const MAX_KNOWLEDGE_PROMPT_CHARS = 120000;
const MAX_KNOWLEDGE_SKILLS = 10;
const MAX_KNOWLEDGE_REFERENCES = 20;
const ASSUMED_CONTEXT_WINDOW_CHARS = 100000;
const RESERVED_HISTORY_CHARS = 20000;

const KNOWLEDGE_HEADER = '\n\n以下是你掌握的专业技能知识，请据此回答：\n\n';

function truncationTail(originalChars) {
    return `\n\n[...专业技能知识已截断，原始 ${originalChars} 字符]`;
}

function resolveCaps(caps) {
    return {
        maxPromptChars: caps.maxPromptChars ?? MAX_KNOWLEDGE_PROMPT_CHARS,
        maxSkills: caps.maxSkills ?? MAX_KNOWLEDGE_SKILLS,
        maxReferences: caps.maxReferences ?? MAX_KNOWLEDGE_REFERENCES,
        assumedContextWindowChars: caps.assumedContextWindowChars ?? ASSUMED_CONTEXT_WINDOW_CHARS,
        reservedHistoryChars: caps.reservedHistoryChars ?? RESERVED_HISTORY_CHARS,
    };
}

function effectiveCharCap(caps) {
    const contextBudget = caps.assumedContextWindowChars - caps.reservedHistoryChars;
    return Math.min(caps.maxPromptChars, contextBudget);
}

function assembleKnowledgeBlock({ bindings, skillProvider, caps = {} }) {
    const resolvedCaps = resolveCaps(caps);
    const charCap = effectiveCharCap(resolvedCaps);

    const sortedBindings = (Array.isArray(bindings) ? bindings : [])
        .slice()
        .sort((a, b) => (a.sort || 0) - (b.sort || 0));

    const parts = [];
    const skillCodes = [];
    const referenceIds = [];
    let skillsCapped = false;
    let refsCapped = false;

    for (const binding of sortedBindings) {
        if (skillCodes.length >= resolvedCaps.maxSkills) {
            skillsCapped = true;
            break;
        }
        const skill = typeof skillProvider === 'function' ? skillProvider(binding.skillCode) : null;
        if (!skill) {
            continue;
        }
        const body = typeof skill.body === 'string' ? skill.body.trim() : '';
        const refList = Array.isArray(skill.references) ? skill.references : [];
        const includeAll = binding.referenceIds === null || binding.referenceIds === undefined;
        const wanted = includeAll ? null : new Set(binding.referenceIds);

        const sub = [];
        if (body) {
            sub.push(body);
        }
        for (const ref of refList) {
            if (referenceIds.length >= resolvedCaps.maxReferences) {
                refsCapped = true;
                break;
            }
            if (wanted && !wanted.has(ref.id)) {
                continue;
            }
            const content = typeof ref.content === 'string' ? ref.content.trim() : '';
            if (content) {
                sub.push(`# ${ref.title}\n\n${content}`);
                referenceIds.push(ref.id);
            }
        }

        const skillText = sub.join('\n\n---\n\n');
        if (skillText) {
            parts.push(`## 专业技能：${skill.name}\n\n${skillText}`);
            skillCodes.push(binding.skillCode);
        }
    }

    const full = parts.join('\n\n---\n\n');
    const originalChars = full.length;
    let block = full;
    let truncated = false;
    if (full.length > charCap) {
        const tail = truncationTail(full.length);
        block = full.slice(0, Math.max(0, charCap - tail.length)) + tail;
        truncated = true;
    }

    return {
        block,
        provenance: {
            skillCodes,
            referenceIds,
            skillsCapped,
            refsCapped,
            truncated,
            originalChars,
            injectedChars: block.length,
            charCap,
        },
    };
}

module.exports = {
    assembleKnowledgeBlock,
    KNOWLEDGE_HEADER,
    MAX_KNOWLEDGE_PROMPT_CHARS,
    MAX_KNOWLEDGE_SKILLS,
    MAX_KNOWLEDGE_REFERENCES,
    ASSUMED_CONTEXT_WINDOW_CHARS,
    RESERVED_HISTORY_CHARS,
};
