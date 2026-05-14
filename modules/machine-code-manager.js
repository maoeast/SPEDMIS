const hardware = require('../hardware');

let machineCodePromise = null;

function loadMachineCodeData() {
    return new Promise((resolve, reject) => {
        hardware.getHardwareInfo((hardwareInfo) => {
            try {
                const machineCode = hardware.generateMachineCode(hardwareInfo);
                const machineCodeCandidates = typeof hardware.getMachineCodeCandidates === 'function'
                    ? hardware.getMachineCodeCandidates(hardwareInfo)
                    : [machineCode];
                resolve({
                    hardwareInfo,
                    machineCode,
                    machineCodeCandidates,
                });
            } catch (error) {
                reject(error);
            }
        });
    });
}

function getMachineCodeData() {
    if (!machineCodePromise) {
        machineCodePromise = loadMachineCodeData().catch((error) => {
            machineCodePromise = null;
            throw error;
        });
    }

    return machineCodePromise;
}

async function getMachineCode() {
    const { machineCode } = await getMachineCodeData();
    return machineCode;
}

function resetCache() {
    machineCodePromise = null;
}

module.exports = {
    getMachineCode,
    getMachineCodeData,
    resetCache,
};
