const { renderSafeMarkdown, isSafeHttpsUrl, tokenizeInline } = require('../modules/safe-markdown');

class FakeNode {
    constructor(tagName, ownerDocument) {
        this.tagName = tagName;
        this.ownerDocument = ownerDocument;
        this.children = [];
        this.textContent = '';
        this.attributes = {};
        this.listeners = {};
        this.dataset = {};
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    append(...children) {
        children.forEach((child) => this.appendChild(child));
    }

    replaceChildren(...children) {
        this.children = children.flatMap((child) => child.tagName === '#fragment' ? child.children : [child]);
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    addEventListener(name, callback) {
        this.listeners[name] = callback;
    }

    collectText() {
        return [this.textContent, ...this.children.map((child) => child.collectText())].join('');
    }

    findTags(tagName) {
        return [
            ...(this.tagName === tagName ? [this] : []),
            ...this.children.flatMap((child) => child.findTags(tagName)),
        ];
    }
}

class FakeDocument {
    createElement(tagName) {
        return new FakeNode(tagName, this);
    }

    createTextNode(text) {
        const node = new FakeNode('#text', this);
        node.textContent = text;
        return node;
    }

    createDocumentFragment() {
        return new FakeNode('#fragment', this);
    }
}

describe('safe markdown renderer', () => {
    test('should permit only HTTPS links without credentials', () => {
        expect(isSafeHttpsUrl('https://example.com/reference')).toBe(true);
        expect(isSafeHttpsUrl('http://example.com/reference')).toBe(false);
        expect(isSafeHttpsUrl('https://user:pass@example.com')).toBe(false);
        expect(isSafeHttpsUrl('javascript:alert(1)')).toBe(false);
    });

    test('should tokenize formatting without evaluating raw HTML', () => {
        const tokens = tokenizeInline('**重点** <script>alert(1)</script> [链接](javascript:alert(1))');
        expect(tokens.some((token) => token.type === 'strong')).toBe(true);
        expect(tokens.every((token) => token.type !== 'link')).toBe(true);
    });

    test('should render raw tags as text and route safe links through the callback', () => {
        const documentRef = new FakeDocument();
        const container = documentRef.createElement('div');
        const externalLink = jest.fn();

        renderSafeMarkdown(
            container,
            '<script>alert(1)</script>\n[安全链接](https://example.com/help)\n[危险链接](javascript:alert(1))',
            { document: documentRef, onExternalLink: externalLink }
        );

        expect(container.findTags('script')).toHaveLength(0);
        expect(container.collectText()).toContain('<script>alert(1)</script>');
        expect(container.findTags('a')).toHaveLength(1);
        expect(container.findTags('a')[0].href).toBe('https://example.com/help');
        container.findTags('a')[0].listeners.click({ preventDefault: jest.fn() });
        expect(externalLink).toHaveBeenCalledWith('https://example.com/help');
    });
});
