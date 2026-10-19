const fs = require('fs');
const path = require('path');

const hardware = require('../hardware');

describe('machine code timeout ordering', () => {
    test('renderer timeout must exceed the main-process overall capture timeout', () => {
        const preloadSource = fs.readFileSync(
            path.join(__dirname, '..', 'preload.js'),
            'utf8'
        );
        const match = preloadSource.match(/MACHINE_CODE_TIMEOUT_MS\s*=\s*(\d+)/);

        expect(match).not.toBeNull();

        const rendererTimeoutMs = Number(match[1]);
        expect(rendererTimeoutMs).toBeGreaterThan(hardware.HARDWARE_COLLECTION_TIMEOUT_MS);
    });

    test('overall capture timeout must cover the slowest wmic-to-PowerShell fallback chain', () => {
        const slowestChainMs = hardware.HARDWARE_COMMAND_TIMEOUTS.wmic
            + hardware.HARDWARE_COMMAND_TIMEOUTS.powershell;

        expect(hardware.HARDWARE_COLLECTION_TIMEOUT_MS).toBeGreaterThanOrEqual(slowestChainMs);
    });
});
