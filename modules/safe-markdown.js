(function (globalScope) {
    const INLINE_PATTERN = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\))/g;

    function isSafeHttpsUrl(value) {
        if (typeof value !== 'string' || value.length > 2000) {
            return false;
        }
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password;
        } catch {
            return false;
        }
    }

    function tokenizeInline(value) {
        const source = typeof value === 'string' ? value : '';
        const tokens = [];
        let cursor = 0;

        for (const match of source.matchAll(INLINE_PATTERN)) {
            if (match.index > cursor) {
                tokens.push({ type: 'text', value: source.slice(cursor, match.index) });
            }
            const raw = match[0];
            if (raw.startsWith('`')) {
                tokens.push({ type: 'code', value: raw.slice(1, -1) });
            } else if (raw.startsWith('**')) {
                tokens.push({ type: 'strong', value: raw.slice(2, -2) });
            } else if (raw.startsWith('*')) {
                tokens.push({ type: 'emphasis', value: raw.slice(1, -1) });
            } else {
                const closingBracket = raw.indexOf('](');
                const label = raw.slice(1, closingBracket);
                const url = raw.slice(closingBracket + 2, -1);
                if (isSafeHttpsUrl(url)) {
                    tokens.push({ type: 'link', value: label, url: new URL(url).toString() });
                } else {
                    tokens.push({ type: 'text', value: raw });
                }
            }
            cursor = match.index + raw.length;
        }

        if (cursor < source.length) {
            tokens.push({ type: 'text', value: source.slice(cursor) });
        }
        return tokens;
    }

    function appendInlineContent(parent, value, documentRef, onExternalLink) {
        for (const token of tokenizeInline(value)) {
            if (token.type === 'text') {
                parent.appendChild(documentRef.createTextNode(token.value));
                continue;
            }

            const elementName = token.type === 'code'
                ? 'code'
                : token.type === 'strong'
                    ? 'strong'
                    : token.type === 'emphasis'
                        ? 'em'
                        : 'a';
            const element = documentRef.createElement(elementName);
            element.textContent = token.value;

            if (token.type === 'link') {
                element.href = token.url;
                element.rel = 'noreferrer noopener';
                element.addEventListener('click', (event) => {
                    event.preventDefault();
                    onExternalLink?.(token.url);
                });
            }
            parent.appendChild(element);
        }
    }

    function appendTextBlock(parent, tagName, lines, documentRef, onExternalLink) {
        const element = documentRef.createElement(tagName);
        lines.forEach((line, index) => {
            if (index > 0) {
                element.appendChild(documentRef.createElement('br'));
            }
            appendInlineContent(element, line, documentRef, onExternalLink);
        });
        parent.appendChild(element);
    }

    function renderSafeMarkdown(container, markdown, options = {}) {
        if (!container || typeof container.replaceChildren !== 'function') {
            throw new TypeError('A DOM container is required');
        }
        const documentRef = options.document || container.ownerDocument || globalScope.document;
        if (!documentRef) {
            throw new TypeError('A document implementation is required');
        }

        const fragment = documentRef.createDocumentFragment();
        const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
        let index = 0;

        while (index < lines.length) {
            const line = lines[index];
            if (!line.trim()) {
                index += 1;
                continue;
            }

            const fenceMatch = line.match(/^```([\w-]*)\s*$/);
            if (fenceMatch) {
                const codeLines = [];
                index += 1;
                while (index < lines.length && !/^```\s*$/.test(lines[index])) {
                    codeLines.push(lines[index]);
                    index += 1;
                }
                if (index < lines.length) {
                    index += 1;
                }
                const pre = documentRef.createElement('pre');
                const code = documentRef.createElement('code');
                code.textContent = codeLines.join('\n');
                if (fenceMatch[1]) {
                    code.dataset.language = fenceMatch[1];
                }
                pre.appendChild(code);
                fragment.appendChild(pre);
                continue;
            }

            const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
            if (headingMatch) {
                appendTextBlock(
                    fragment,
                    `h${headingMatch[1].length}`,
                    [headingMatch[2]],
                    documentRef,
                    options.onExternalLink
                );
                index += 1;
                continue;
            }

            if (/^([-*_])\1\1+\s*$/.test(line.trim())) {
                fragment.appendChild(documentRef.createElement('hr'));
                index += 1;
                continue;
            }

            const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/);
            const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
            if (unorderedMatch || orderedMatch) {
                const ordered = Boolean(orderedMatch);
                const list = documentRef.createElement(ordered ? 'ol' : 'ul');
                const itemPattern = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-*]\s+(.+)$/;
                while (index < lines.length) {
                    const itemMatch = lines[index].match(itemPattern);
                    if (!itemMatch) {
                        break;
                    }
                    const item = documentRef.createElement('li');
                    appendInlineContent(item, itemMatch[1], documentRef, options.onExternalLink);
                    list.appendChild(item);
                    index += 1;
                }
                fragment.appendChild(list);
                continue;
            }

            const quoteMatch = line.match(/^>\s?(.*)$/);
            if (quoteMatch) {
                const quoteLines = [];
                while (index < lines.length) {
                    const nextQuote = lines[index].match(/^>\s?(.*)$/);
                    if (!nextQuote) {
                        break;
                    }
                    quoteLines.push(nextQuote[1]);
                    index += 1;
                }
                appendTextBlock(fragment, 'blockquote', quoteLines, documentRef, options.onExternalLink);
                continue;
            }

            const paragraphLines = [line];
            index += 1;
            while (
                index < lines.length
                && lines[index].trim()
                && !/^(#{1,3})\s+/.test(lines[index])
                && !/^```/.test(lines[index])
                && !/^\s*([-*]|\d+\.)\s+/.test(lines[index])
                && !/^>/.test(lines[index])
            ) {
                paragraphLines.push(lines[index]);
                index += 1;
            }
            appendTextBlock(fragment, 'p', paragraphLines, documentRef, options.onExternalLink);
        }

        container.replaceChildren(fragment);
        return container;
    }

    const api = {
        isSafeHttpsUrl,
        tokenizeInline,
        renderSafeMarkdown,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    globalScope.safeMarkdown = api;
})(typeof window !== 'undefined' ? window : globalThis);
