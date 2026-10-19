jest.mock('../logger', () => ({
    LogLevel: { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 },
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    })),
}));

jest.mock('../hardware', () => ({
    getHardwareInfo: jest.fn(),
    generateMachineCode: jest.fn(),
    getMachineCodeCandidates: jest.fn(),
}));

const hardware = require('../hardware');
const machineCodeManager = require('../modules/machine-code-manager');

describe('machine-code-manager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        machineCodeManager.resetCache();
    });

    test('should reuse the same machine code for concurrent requests in one session', async () => {
        const hardwareInfo = { mac: 'MAC-1' };

        hardware.getHardwareInfo.mockImplementation((callback) => {
            setImmediate(() => callback(hardwareInfo));
        });
        hardware.generateMachineCode.mockReturnValue('machine-code-1');

        const [first, second] = await Promise.all([
            machineCodeManager.getMachineCodeData(),
            machineCodeManager.getMachineCodeData(),
        ]);

        expect(first).toEqual({
            hardwareInfo,
            machineCode: 'machine-code-1',
        });
        expect(second).toEqual(first);
        expect(hardware.getHardwareInfo).toHaveBeenCalledTimes(1);
        expect(hardware.generateMachineCode).toHaveBeenCalledTimes(1);
    });

    test('should return the cached machine code for later requests in the same session', async () => {
        const hardwareInfo = { mac: 'MAC-2' };

        hardware.getHardwareInfo.mockImplementation((callback) => {
            callback(hardwareInfo);
        });
        hardware.generateMachineCode.mockReturnValue('machine-code-2');

        const first = await machineCodeManager.getMachineCodeData();
        const second = await machineCodeManager.getMachineCodeData();

        expect(first.machineCode).toBe('machine-code-2');
        expect(second.machineCode).toBe('machine-code-2');
        expect(hardware.getHardwareInfo).toHaveBeenCalledTimes(1);
    });

    test('should clear the cache after a failure so the next request can retry', async () => {
        const hardwareInfo = { mac: 'MAC-3' };

        hardware.getHardwareInfo.mockImplementation((callback) => {
            callback(hardwareInfo);
        });
        hardware.generateMachineCode
            .mockImplementationOnce(() => {
                throw new Error('machine code failed');
            })
            .mockReturnValueOnce('machine-code-3');

        await expect(machineCodeManager.getMachineCodeData()).rejects.toThrow('machine code failed');

        const retried = await machineCodeManager.getMachineCodeData();

        expect(retried.machineCode).toBe('machine-code-3');
        expect(hardware.getHardwareInfo).toHaveBeenCalledTimes(2);
        expect(hardware.generateMachineCode).toHaveBeenCalledTimes(2);
    });

    test('should expose candidate machine codes for compatibility checks', async () => {
        const hardwareInfo = { mac: 'MAC-4' };

        hardware.getHardwareInfo.mockImplementation((callback) => {
            callback(hardwareInfo);
        });
        hardware.generateMachineCode.mockReturnValue('machine-code-current');
        hardware.getMachineCodeCandidates.mockReturnValue([
            'machine-code-current',
            'machine-code-legacy',
        ]);

        const result = await machineCodeManager.getMachineCodeData();

        expect(result).toEqual({
            hardwareInfo,
            machineCode: 'machine-code-current',
            machineCodeCandidates: [
                'machine-code-current',
                'machine-code-legacy',
            ],
        });
        expect(hardware.getMachineCodeCandidates).toHaveBeenCalledWith(hardwareInfo);
    });

    test('should reject an incomplete hardware capture without caching it', async () => {
        hardware.getHardwareInfo
            .mockImplementationOnce((callback) => {
                setImmediate(() => callback({
                    mac: 'MAC-INCOMPLETE',
                    capture: { incomplete: true, durationMs: 15000 },
                }));
            })
            .mockImplementationOnce((callback) => {
                setImmediate(() => callback({
                    mac: 'MAC-COMPLETE',
                    cpu: 'CPU-1',
                    motherboard: 'MB-1',
                    stableHardDisk: 'HD-1',
                    capture: { incomplete: false, durationMs: 1200 },
                }));
            });
        hardware.generateMachineCode.mockReturnValue('machine-code-after-retry');
        hardware.getMachineCodeCandidates.mockReturnValue(['machine-code-after-retry']);

        await expect(machineCodeManager.getMachineCodeData()).rejects.toMatchObject({
            code: machineCodeManager.INCOMPLETE_CAPTURE_CODE,
        });

        const retried = await machineCodeManager.getMachineCodeData();

        expect(retried.machineCode).toBe('machine-code-after-retry');
        expect(hardware.getHardwareInfo).toHaveBeenCalledTimes(2);
    });

    test('should cache a complete capture even when some fields are unknown', async () => {
        const hardwareInfo = {
            mac: 'MAC-5',
            cpu: 'UNKNOWN_CPU',
            motherboard: 'UNKNOWN_MB',
            stableHardDisk: 'UNKNOWN_HD',
            capture: { incomplete: false, durationMs: 900 },
        };

        hardware.getHardwareInfo.mockImplementation((callback) => {
            callback(hardwareInfo);
        });
        hardware.generateMachineCode.mockReturnValue('degraded-machine-code');

        const first = await machineCodeManager.getMachineCodeData();
        const second = await machineCodeManager.getMachineCodeData();

        expect(first.machineCode).toBe('degraded-machine-code');
        expect(second.machineCode).toBe('degraded-machine-code');
        expect(hardware.getHardwareInfo).toHaveBeenCalledTimes(1);
    });
});
