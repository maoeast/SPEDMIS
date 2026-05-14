const crypto = require('crypto');

const hardware = require('../hardware');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

describe('hardware machine code stability', () => {
    test('should keep the same stable machine code when usb storage changes disk enumeration order', () => {
        const hardwareInfoBeforeUsb = {
            mac: 'USB-NIC-MAC',
            cpu: 'CPU-1',
            hardDisk: 'USB_DISK',
            motherboard: 'MB-1',
            stableMac: 'LAN-MAC',
            stableHardDisk: 'SYSTEM_DISK',
        };
        const hardwareInfoAfterUsb = {
            mac: 'LAN-MAC',
            cpu: 'CPU-1',
            hardDisk: 'SYSTEM_DISK',
            motherboard: 'MB-1',
            stableMac: 'LAN-MAC',
            stableHardDisk: 'SYSTEM_DISK',
        };

        expect(hardware.generateMachineCode(hardwareInfoBeforeUsb)).toBe(
            hardware.generateMachineCode(hardwareInfoAfterUsb)
        );
    });

    test('should use stable hardware fields when generating the current machine code', () => {
        const hardwareInfo = {
            mac: 'WIFI-MAC',
            cpu: 'CPU-2',
            hardDisk: 'REMOVABLE_DISK',
            motherboard: 'MB-2',
            stableMac: 'ETHERNET-MAC',
            stableHardDisk: 'INTERNAL_DISK',
        };

        const expected = sha256('ETHERNET-MAC-CPU-2-INTERNAL_DISK-MB-2');

        expect(hardware.generateMachineCode(hardwareInfo)).toBe(expected);
    });

    test('should provide compatibility candidates including the legacy fingerprint', () => {
        const hardwareInfo = {
            mac: 'WIFI-MAC',
            cpu: 'CPU-3',
            hardDisk: 'REMOVABLE_DISK',
            motherboard: 'MB-3',
            stableMac: 'ETHERNET-MAC',
            stableHardDisk: 'INTERNAL_DISK',
        };

        const candidates = hardware.getMachineCodeCandidates(hardwareInfo);

        expect(candidates).toEqual([
            sha256('ETHERNET-MAC-CPU-3-INTERNAL_DISK-MB-3'),
            sha256('WIFI-MAC-CPU-3-REMOVABLE_DISK-MB-3'),
        ]);
    });
});
