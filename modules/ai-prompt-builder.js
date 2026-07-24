const DEFAULT_MAX_MESSAGES = 40;
const DEFAULT_MAX_CHARACTERS = 60000;
const ALLOWED_ROLES = new Set(['user', 'assistant']);

function normalizeHistory(messages) {
    if (!Array.isArray(messages)) {
        return [];
    }

    return messages
        .filter((message) => message && ALLOWED_ROLES.has(message.role))
        .filter((message) => message.role === 'user' || message.status === 'complete')
        .map((message) => ({
            role: message.role,
            content: typeof message.content === 'string' ? message.content.trim() : '',
        }))
        .filter((message) => message.content);
}

function buildPromptMessages({
    systemPrompt,
    messages,
    maxMessages = DEFAULT_MAX_MESSAGES,
    maxCharacters = DEFAULT_MAX_CHARACTERS,
}) {
    const normalizedMaxMessages = Math.max(1, Math.min(100, Number(maxMessages) || DEFAULT_MAX_MESSAGES));
    const normalizedMaxCharacters = Math.max(1000, Math.min(200000, Number(maxCharacters) || DEFAULT_MAX_CHARACTERS));
    const history = normalizeHistory(messages);
    const selected = [];
    let usedCharacters = 0;

    for (let index = history.length - 1; index >= 0 && selected.length < normalizedMaxMessages; index -= 1) {
        const message = history[index];
        if (selected.length > 0 && usedCharacters + message.content.length > normalizedMaxCharacters) {
            break;
        }

        selected.unshift(message);
        usedCharacters += message.content.length;
    }

    const result = [];
    const normalizedSystemPrompt = typeof systemPrompt === 'string' ? systemPrompt.trim() : '';
    if (normalizedSystemPrompt) {
        result.push({ role: 'system', content: normalizedSystemPrompt });
    }
    result.push(...selected);
    return result;
}

module.exports = {
    DEFAULT_MAX_MESSAGES,
    DEFAULT_MAX_CHARACTERS,
    buildPromptMessages,
    normalizeHistory,
};
