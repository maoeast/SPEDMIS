const fs = require('fs');
const path = require('path');

describe('IEP shell page', () => {
    test('should expose persistent navigation controls and embed the legacy entry page', () => {
        const html = fs.readFileSync(
            path.join(__dirname, '..', 'iep', 'index.html'),
            'utf8'
        );

        expect(html).toContain('id="backButton"');
        expect(html).toContain('id="refreshButton"');
        expect(html).toContain('id="forwardButton"');
        expect(html).toContain('<webview');
        expect(html).toContain('src="./embedded-entry.html"');
    });

    test('should provide a full-height viewport for the embedded webview', () => {
        const html = fs.readFileSync(
            path.join(__dirname, '..', 'iep', 'index.html'),
            'utf8'
        );

        const bodyBlock = html.match(/body\s*\{([\s\S]*?)\}/);
        const shellContentBlock = html.match(/\.shell-content\s*\{([\s\S]*?)\}/);
        const webviewBlock = html.match(/#iepWebview\s*\{([\s\S]*?)\}/);

        expect(bodyBlock?.[1]).toContain('height: 100vh;');
        expect(shellContentBlock?.[1]).toContain('display: flex;');
        expect(shellContentBlock?.[1]).toContain('flex: 1;');
        expect(webviewBlock?.[1]).toContain('flex: 1;');
    });

    test('should render a transparent icon toolbar with hover motion', () => {
        const html = fs.readFileSync(
            path.join(__dirname, '..', 'iep', 'index.html'),
            'utf8'
        );

        const shellActionsBlock = html.match(/\.shell-actions\s*\{([\s\S]*?)\}/);

        expect(html).toContain('class="shell-button fa-solid fa-arrow-left"');
        expect(html).toContain('class="shell-button fa-solid fa-rotate-right"');
        expect(html).toContain('class="shell-button fa-solid fa-arrow-right"');
        expect(html).toContain('transform: translateY(-2px) scale(1.04);');
        expect(shellActionsBlock?.[1]).toContain('position: fixed;');
        expect(shellActionsBlock?.[1]).toContain('right: 16px;');
        expect(shellActionsBlock?.[1]).toContain('bottom: 24px;');
        expect(shellActionsBlock?.[1]).toContain('background: rgba(255, 255, 255, 0.18);');
    });

    test('should not render a top toolbar wrapper', () => {
        const html = fs.readFileSync(
            path.join(__dirname, '..', 'iep', 'index.html'),
            'utf8'
        );

        expect(html).not.toContain('class="shell-toolbar"');
        expect(html).not.toContain('id="statusText"');
    });
});
