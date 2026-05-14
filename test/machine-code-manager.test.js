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
});
