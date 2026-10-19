const hardware = require('../hardware');
const { getLogger, LogLevel } = require('../logger');

// 采集耗时要进生产日志（全局默认 warn），因此这条链路固定用 info 级。
const logger = getLogger('MACHINE_CODE', { level: LogLevel.INFO });
const INCOMPLETE_CAPTURE_CODE = 'HARDWARE_CAPTURE_INCOMPLETE';

let machineCodePromise = null;

function createIncompleteCaptureError() {
    const error = new Error('硬件信息读取超时，请重试');
    error.code = INCOMPLETE_CAPTURE_CODE;
    return error;
}

function loadMachineCodeData() {
    return new Promise((resolve, reject) => {
        hardware.getHardwareInfo((hardwareInfo) => {
            try {
                const capture = hardwareInfo && hardwareInfo.capture;

                // 整体兜底触发时字段可能仍在采集中，结果不是稳定的机器码；
                // 不缓存、不回包，让渲染层可以重试，避免把降级码写进激活存储。
                if (capture && capture.incomplete) {
                    logger.warn('Hardware capture incomplete; machine code request rejected for retry', {
                        durationMs: capture.durationMs,
                    });
                    reject(createIncompleteCaptureError());
                    return;
                }

                const machineCode = hardware.generateMachineCode(hardwareInfo);
                const machineCodeCandidates = typeof hardware.getMachineCodeCandidates === 'function'
                    ? hardware.getMachineCodeCandidates(hardwareInfo)
                    : [machineCode];

                logger.info('Hardware capture completed', {
                    machineCode: `${machineCode.substring(0, 8)}...`,
                    durationMs: capture ? capture.durationMs : null,
                    fields: capture ? capture.fields : null,
                });

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
    INCOMPLETE_CAPTURE_CODE,
};
