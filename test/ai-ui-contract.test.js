const fs = require('fs');
const path = require('path');

function readProjectFile(fileName) {
    return fs.readFileSync(path.join(__dirname, '..', fileName), 'utf8');
}

describe('AI assistant UI contract', () => {
    test('should load a native HTML workbench with the isolated preload and privacy gate', () => {
        const html = readProjectFile('ai-assistant.html');

        expect(html).toContain('Content-Security-Policy');
        expect(html).toContain('modules/safe-markdown.js');
        expect(html).toContain('id="conversationList"');
        expect(html).toContain('id="messageInput"');
        expect(html).toContain('id="switchAgentButton"');
        expect(html).toContain('id="agentSwitcherList"');
        expect(html).toContain('id="providerForm"');
        expect(html).toMatch(/id="settingsPanel"[^>]*aria-hidden="true"[^>]*inert/);
        expect(html).toMatch(/id="hardLimitEnabled"[^>]*checked/);
        expect(html).toContain('id="privacyDialog"');
        expect(html).toContain('id="acceptPrivacyButton"');
        expect(html).not.toMatch(/vue|pinia|element-plus/i);
    });

    test('should include responsive app-shell states and avoid generic transition shortcuts', () => {
        const css = readProjectFile('ai-assistant.css');

        expect(css).toContain('grid-template-columns: 264px minmax(0, 1fr)');
        expect(css).toContain('.agent-avatar-image');
        expect(css).toContain('transform: translateX(105%)');
        expect(css).toContain('@media (max-width: 560px)');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toContain('min-height: 40px');
        expect(css).not.toContain('transition: all');
        expect(css).not.toMatch(/purple|#6[0-9a-f]{2}e[0-9a-f]{2}/i);
    });

    test('should keep the renderer on the preload API boundary', () => {
        const script = readProjectFile('ai-assistant.js');

        expect(script).toContain('globalScope.aiAPI');
        expect(script).toContain('globalScope.safeMarkdown');
        expect(script).toContain('renderAgentSwitcher');
        expect(script).toContain('./images/ai-agent-avatars/个别化教学专家.png');
        expect(script).toContain('./images/ai-agent-avatars/课堂沟通支持专家.png');
        expect(script).toContain('./images/ai-agent-avatars/成长观察助手.png');
        expect(script).toContain('./images/ai-agent-avatars/家校沟通助手.png');
        expect(script).toContain('./images/ai-agent-avatars/情绪支持助手.png');
        expect(script).not.toMatch(/\bfetch\s*\(/);
        expect(script).not.toMatch(/\blocalStorage\b/);
        expect(script).not.toMatch(/\brequire\s*\(/);
        expect(script).not.toContain('innerHTML =');
    });

    test('should configure the AI window with a single-instance safe boundary', () => {
        const main = readProjectFile('main.js');

        expect(main).toContain('function createAIWindow()');
        expect(main).toContain('nodeIntegration: false');
        expect(main).toContain('contextIsolation: true');
        expect(main).toContain('sandbox: true');
        expect(main).toContain("setWindowOpenHandler(() => ({ action: 'deny' }))");
        expect(main).toContain("ipcMain.handle('ai-open-window'");
        expect(main).toContain('aiWindow.focus()');
    });
});
