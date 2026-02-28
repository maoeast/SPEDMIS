/**
 * 虚拟机环境检测模块
 * 
 * 检测应用是否运行在虚拟机环境中
 * 虚拟机环境包括：VirtualBox、VMware、Hyper-V、KVM等
 * 
 * 检测方法：
 * 1. 硬件特征检测：特定的硬件指标表明虚拟化环境
 * 2. 注册表检测（Windows）：特定的注册表项
 * 3. 系统特征检测：虚拟机特有的系统信息
 * 4. 驱动程序检测：虚拟化驱动的特征
 */

const os = require('os');
const { exec } = require('child_process');
const { getLogger } = require('../logger');

const logger = getLogger('VM_DETECTOR');

/**
 * Windows系统虚拟机检测
 * 检查注册表和系统特征
 */
function detectWindowsVM(callback) {
    const vmIndicators = [];

    // 检查注册表中的虚拟机特征
    const registryChecks = [
        {
            path: 'HKEY_LOCAL_MACHINE\\HARDWARE\\DEVICEMAP\\Scsi\\Scsi Port 0\\Scsi Bus 0\\Target Id 0\\Logical Unit Id 0',
            key: 'Identifier',
            indicators: ['VMware', 'VirtualBox', 'QEMU', 'Xen']
        },
        {
            path: 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services',
            keys: ['VBoxGuest', 'VBoxService', 'vmxnet', 'vmxnet3', 'VMCI', 'vmmemctl']
        },
        {
            path: 'HKEY_LOCAL_MACHINE\\HARDWARE\\DEVICEMAP\\Scsi',
            indicators: ['VBOX', 'QEMU']
        }
    ];

    // 检查系统信息中的虚拟机特征
    exec('systeminfo', { timeout: 5000 }, (error, stdout) => {
        if (!error) {
            const vmPatterns = /Hyper-V|VirtualBox|VMware|QEMU|Xen|KVM/i;
            if (vmPatterns.test(stdout)) {
                vmIndicators.push('systeminfo_vm_detected');
            }
        }

        // 继续执行其他检查
        checkWindowsRegistry(vmIndicators, callback);
    });
}

/**
 * Windows注册表检查
 */
function checkWindowsRegistry(indicators, callback) {
    // 检查特定的虚拟机驱动和服务
    const vmServices = ['VBoxGuest', 'VBoxService', 'vmxnet', 'vmci', 'vmmemctl', 'hyperv'];

    exec('sc query type=driver', { timeout: 3000 }, (error, stdout) => {
        if (!error) {
            vmServices.forEach(service => {
                if (stdout.includes(service)) {
                    indicators.push(`${service}_driver_detected`);
                }
            });
        }

        // 检查BIOS信息
        checkBIOSInfo(indicators, callback);
    });
}

/**
 * BIOS信息检查
 */
function checkBIOSInfo(indicators, callback) {
    exec('wmic baseboard get manufacturer,product', { timeout: 3000 }, (error, stdout) => {
        if (!error) {
            const vmPatterns = /VirtualBox|VMware|QEMU|Xen|Hyper-V|KVM/i;
            if (vmPatterns.test(stdout)) {
                indicators.push('bios_vm_detected');
            }
        }

        callback(indicators);
    });
}

/**
 * macOS虚拟机检测
 */
function detectMacVM(callback) {
    const vmIndicators = [];

    // 检查系统报告中的虚拟化标记
    exec('system_profiler SPHardwareDataType | grep -i "virtual"', { timeout: 3000 }, (error, stdout) => {
        if (!error && stdout.trim()) {
            vmIndicators.push('system_profiler_vm_detected');
        }

        // 检查硬件型号
        exec('sysctl hw.model', { timeout: 3000 }, (error, stdout) => {
            if (!error) {
                if (/VMware|VirtualBox|QEMU|Xen/i.test(stdout)) {
                    vmIndicators.push('hardware_model_vm_detected');
                }
            }

            callback(vmIndicators);
        });
    });
}

/**
 * 检测硬件特征（跨平台）
 * 虚拟机的CPU核心数、内存等通常与实体机不同
 */
function detectHardwareAnomalies(callback) {
    const anomalies = [];

    const cpuCount = os.cpus().length;
    const totalMemory = os.totalmem();

    // 检测异常的CPU核心数（虚拟机通常是2、4等）
    // 这是不可靠的检测方法，但可作为参考
    if (cpuCount <= 2) {
        anomalies.push('unusual_cpu_count');
    }

    // 检测异常的内存大小（虚拟机常见的内存量）
    const memoryGB = totalMemory / (1024 ** 3);
    if (memoryGB <= 2 || memoryGB === 4 || memoryGB === 8) {
        anomalies.push('common_vm_memory_size');
    }

    callback(anomalies);
}

/**
 * 检查硬件设备
 */
function checkHardwareDevices(callback) {
    if (process.platform === 'win32') {
        exec('wmic logicaldisk where drivetype=3 get name', { timeout: 3000 }, (error, stdout) => {
            if (!error) {
                // 虚拟机通常只有一个或两个逻辑驱动器
                const driveCount = (stdout.match(/[C-Z]:/g) || []).length;
                const indicators = driveCount <= 2 ? ['minimal_drives'] : [];
                callback(indicators);
            } else {
                callback([]);
            }
        });
    } else {
        callback([]);
    }
}

/**
 * 综合检测：判断是否运行在虚拟机中
 */
function detectVirtualMachine(callback) {
    try {
        logger.info('Starting virtual machine detection...');

        const allIndicators = [];
        let completed = 0;
        const totalChecks = 3;

        const handleCheckComplete = () => {
            completed++;
            if (completed === totalChecks) {
                // 分析结果
                const isVirtualMachine = allIndicators.length > 0;

                const result = {
                    isVirtualMachine,
                    indicators: allIndicators,
                    confidence: calculateConfidence(allIndicators)
                };

                logger.info('Virtual machine detection completed', {
                    isVM: isVirtualMachine,
                    detectedIndicators: allIndicators.length,
                    confidence: result.confidence
                });

                callback(result);
            }
        };

        // 执行平台特定检测
        if (process.platform === 'win32') {
            detectWindowsVM((indicators) => {
                allIndicators.push(...indicators);
                handleCheckComplete();
            });
        } else if (process.platform === 'darwin') {
            detectMacVM((indicators) => {
                allIndicators.push(...indicators);
                handleCheckComplete();
            });
        } else {
            // Linux系统
            allIndicators.push('linux_detected');
            handleCheckComplete();
        }

        // 硬件检测
        detectHardwareAnomalies((anomalies) => {
            allIndicators.push(...anomalies);
            handleCheckComplete();
        });

        // 设备检测
        checkHardwareDevices((devices) => {
            allIndicators.push(...devices);
            handleCheckComplete();
        });
    } catch (error) {
        logger.error('Virtual machine detection error', { error: error.message });
        callback({
            isVirtualMachine: false,
            indicators: [],
            confidence: 0,
            error: error.message
        });
    }
}

/**
 * 计算虚拟机检测的置信度（0-100）
 */
function calculateConfidence(indicators) {
    if (indicators.length === 0) {
        return 0;
    }

    // 权重分配
    const weights = {
        'systeminfo_vm_detected': 30,
        'bios_vm_detected': 40,
        'system_profiler_vm_detected': 35,
        'hardware_model_vm_detected': 35,
        'vboxguest_driver_detected': 50,
        'vmxnet_driver_detected': 50,
        'vmci_driver_detected': 45,
        'unusual_cpu_count': 10,
        'common_vm_memory_size': 15,
        'minimal_drives': 10
    };

    let totalWeight = 0;
    indicators.forEach(indicator => {
        totalWeight += weights[indicator] || 5; // 未知指标赋予5分
    });

    // 最高100分
    return Math.min(totalWeight, 100);
}

module.exports = {
    detectVirtualMachine
};
