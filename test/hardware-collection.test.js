const hardware = require('../hardware');

const windowsTest = process.platform === 'win32' ? test : test.skip;

function collectHardware(options) {
    return new Promise((resolve) => {
        hardware.getHardwareInfo(resolve, options);
    });
}

function success(stdout) {
    return {
        ok: true,
        stdout,
        error: null,
        timedOut: false,
        durationMs: 1,
    };
}

function failure(message = 'command failed') {
    return {
        ok: false,
        stdout: '',
        error: new Error(message),
        timedOut: false,
        durationMs: 1,
    };
}

function diskInventoryJson(serialNumber) {
    return JSON.stringify([
        {
            Index: 0,
            InterfaceType: 'IDE',
            MediaType: 'Fixed hard disk media',
            Model: 'TEST DISK',
            PNPDeviceID: 'SCSI\\DISK',
            SerialNumber: serialNumber,
        },
    ]);
}

describe('hardware collection scheduling and fallbacks', () => {
    windowsTest('should start CPU, motherboard and disk queries in parallel', async () => {
        const started = [];
        const runner = jest.fn(async (spec) => {
            started.push({ label: spec.label, at: Date.now() });

            if (spec.label === 'cpu-wmic') {
                return success('ProcessorId\r\nCPU-1\r\n');
            }
            if (spec.label === 'mb-wmic') {
                return success('SerialNumber\r\nMB-1\r\n');
            }
            if (spec.label === 'disk-powershell') {
                return success(diskInventoryJson('HD-1'));
            }

            return failure(`unexpected command: ${spec.label}`);
        });

        const info = await collectHardware({ commandRunner: runner });
        const labels = started.map((item) => item.label);
        const spread = Math.max(...started.map((item) => item.at))
            - Math.min(...started.map((item) => item.at));

        expect(labels).toEqual(expect.arrayContaining([
            'cpu-wmic',
            'mb-wmic',
            'disk-powershell',
        ]));
        expect(spread).toBeLessThan(100);
        expect(info.cpu).toBe('CPU-1');
        expect(info.motherboard).toBe('MB-1');
        expect(info.hardDisk).toBe('HD-1');
        expect(info.stableHardDisk).toBe('HD-1');
        expect(info.capture.incomplete).toBe(false);
        expect(info.capture.fields.cpu.source).toBe('cpu-wmic');
    });

    windowsTest('should fall back to PowerShell when wmic is unavailable', async () => {
        const runner = jest.fn(async (spec) => {
            if (spec.label === 'cpu-wmic') {
                return failure('wmic is not recognized');
            }
            if (spec.label === 'cpu-powershell') {
                return success('PS-CPU\r\n');
            }
            if (spec.label === 'mb-wmic') {
                return failure('wmic is not recognized');
            }
            if (spec.label === 'mb-powershell') {
                return success('PS-MB\r\n');
            }
            if (spec.label === 'disk-powershell') {
                return success(diskInventoryJson('PS-HD'));
            }

            return failure(`unexpected command: ${spec.label}`);
        });

        const info = await collectHardware({ commandRunner: runner });

        expect(info.cpu).toBe('PS-CPU');
        expect(info.motherboard).toBe('PS-MB');
        expect(info.hardDisk).toBe('PS-HD');
        expect(info.capture.fields.cpu.source).toBe('cpu-powershell');
        expect(info.capture.fields.cpu.attempts).toEqual([
            expect.objectContaining({ label: 'cpu-wmic', resolved: false }),
            expect.objectContaining({ label: 'cpu-powershell', resolved: true }),
        ]);
        expect(info.capture.fields.motherboard.source).toBe('mb-powershell');
    });

    windowsTest('should pass the configured timeout to every command', async () => {
        const seenTimeouts = {};
        const runner = jest.fn(async (spec, timeoutMs) => {
            seenTimeouts[spec.label] = timeoutMs;

            if (spec.label === 'cpu-wmic') {
                return failure();
            }
            if (spec.label === 'cpu-powershell') {
                return success('CPU-1');
            }
            if (spec.label === 'mb-wmic') {
                return success('SerialNumber\r\nMB-1');
            }
            if (spec.label === 'disk-powershell') {
                return success(diskInventoryJson('HD-1'));
            }

            return failure();
        });

        await collectHardware({ commandRunner: runner });

        expect(seenTimeouts['cpu-wmic']).toBe(hardware.HARDWARE_COMMAND_TIMEOUTS.wmic);
        expect(seenTimeouts['cpu-powershell']).toBe(hardware.HARDWARE_COMMAND_TIMEOUTS.powershell);
        expect(seenTimeouts['mb-wmic']).toBe(hardware.HARDWARE_COMMAND_TIMEOUTS.wmic);
        expect(seenTimeouts['disk-powershell']).toBe(hardware.HARDWARE_COMMAND_TIMEOUTS.powershell);
    });

    windowsTest('should return a complete degraded capture when every command fails', async () => {
        const info = await collectHardware({
            commandRunner: jest.fn(async () => failure()),
        });

        expect(info.capture.incomplete).toBe(false);
        expect(info.cpu).toBe('UNKNOWN_CPU');
        expect(info.motherboard).toBe('UNKNOWN_MB');
        expect(info.hardDisk).toBe('UNKNOWN_HD');
        expect(info.stableHardDisk).toBe('UNKNOWN_HD');
    });

    test('should mark the capture incomplete when the overall guard fires', async () => {
        const info = await collectHardware({
            overallTimeoutMs: 25,
            commandRunner: () => new Promise(() => {}),
        });

        expect(info.capture.incomplete).toBe(true);
        expect(info.mac).toBeDefined();
        expect(info.cpu).toBeUndefined();
    });

    test('should mark the capture incomplete when a collector throws', async () => {
        const info = await collectHardware({
            commandRunner: async () => {
                throw new Error('collector exploded');
            },
        });

        expect(info.capture.incomplete).toBe(true);
        expect(info.capture.fields.error).toBe('collector exploded');
    });
});
