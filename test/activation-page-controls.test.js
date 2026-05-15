const fs = require('fs');
const path = require('path');

describe('activation page controls', () => {
    function getActivationHtml() {
        return fs.readFileSync(
            path.join(__dirname, '..', 'activation.html'),
            'utf8'
        );
    }

    test('should render a labeled machine code copy button', () => {
        const html = getActivationHtml();

        expect(html).toContain('title="复制机器码"');
        expect(html).toContain('>复制机器码<');
    });

    test('should render a paste button beside the activation code input', () => {
        const html = getActivationHtml();

        expect(html).toContain('class="activation-code-row"');
        expect(html).toContain('id="pasteActivationCodeButton"');
        expect(html).toContain('onclick="pasteActivationCode()"');
        expect(html).toMatch(/<button[\s\S]*id="pasteActivationCodeButton"[\s\S]*>\s*粘贴激活码\s*<\/button>/);
    });

    test('should implement clipboard paste for the activation code field', () => {
        const html = getActivationHtml();

        expect(html).toContain('function pasteActivationCode()');
        expect(html).toContain('navigator.clipboard.readText()');
        expect(html).toContain("document.getElementById('activationCode').value = pastedText.trim();");
    });
});
