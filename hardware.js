const os = require('os');
const { exec } = require('child_process');
const crypto = require('crypto');

// 获取MAC地址
function getMacAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const item of interfaces[name]) {
      if (item.mac && item.mac !== '00:00:00:00:00:00') {
        return item.mac.replace(/:/g, '').toUpperCase();
      }
    }
  }
  return "UNKNOWN_MAC";
}

// 获取硬盘序列号（Windows）
function getHardDiskSerial(callback) {
  if (process.platform === 'win32') {
    exec('wmic diskdrive get SerialNumber', (error, stdout) => {
      if (!error) {
        const match = stdout.match(/.*[A-Z0-9]{10}/);
        if (match) {
          callback(match[0].trim());
          return;
        }
      }
      callback('UNKNOWN_HD');
    });
  } else {
    // macOS实现（简化版）
    exec('ioreg -l | grep IOPlatformSerialNumber', (error, stdout) => {
      if (!error) {
        const match = stdout.match(/"([^"]+)"$/m);
        if (match) {
          callback(match[1].trim());
          return;
        }
      }
      callback('UNKNOWN_HD');
    });
  }
}

// 获取主板序列号（Windows）
function getMotherboardSerial(callback) {
  if (process.platform === 'win32') {
    exec('wmic baseboard get serialnumber', (error, stdout) => {
      if (!error) {
        const serial = stdout.trim().replace(/\s+/g, '');
        if (serial) {
          callback(serial);
          return;
        }
      }
      callback('UNKNOWN_MB');
    });
  } else {
    // macOS实现（简化版）
    exec('system_profiler SPHardwareDataType | grep "Model Identifier"', (error, stdout) => {
      if (!error) {
        const match = stdout.match(/Model Identifier:\s*(.+)/i);
        if (match) {
          callback(match[1].trim());
          return;
        }
      }
      callback('UNKNOWN_MB');
    });
  }
}

// 获取CPU序列号
function getCpuSerial(callback) {
  if (process.platform === 'win32') {
    exec('wmic cpu get ProcessorId', (error, stdout) => {
      if (!error) {
        const serial = stdout.trim().replace(/\s+/g, '');
        if (serial) {
          callback(serial);
          return;
        }
      }
      callback('UNKNOWN_CPU');
    });
  } else {
    // macOS实现
    exec('sysctl -n machdep.cpu.brand_string', (error, stdout) => {
      if (!error) {
        const cpuInfo = stdout.trim();
        if (cpuInfo) {
          callback(cpuInfo);
          return;
        }
      }
      callback('UNKNOWN_CPU');
    });
  }
}

// 获取完整的硬件信息（改进异步处理）
function getHardwareInfo(callback) {
  const hardware = {};
  let completed = false;

  // 最长等待时间：5秒
  const timeout = setTimeout(() => {
    if (!completed) {
      completed = true;
      // 粗程过久，使用一个默认版本，执行准有延迟
      callback(hardware);
    }
  }, 5000);

  // 先获取MAC地址（同步）
  hardware.mac = getMacAddress();

  // 使用Promise链确保异步操作顺序执行
  getCpuSerialAsync()
    .then(cpu => {
      hardware.cpu = cpu;
      return getMotherboardSerialAsync();
    })
    .then(mb => {
      hardware.motherboard = mb;
      return getHardDiskSerialAsync();
    })
    .then(hd => {
      hardware.hardDisk = hd;
      if (!completed) {
        completed = true;
        clearTimeout(timeout);
        callback(hardware);
      }
    })
    .catch(err => {
      if (!completed) {
        completed = true;
        clearTimeout(timeout);
        callback(hardware); // 即使部分失败也返回已收集的信息
      }
    });
}

// 将异步函数包装为Promise
function getCpuSerialAsync() {
  return new Promise((resolve, reject) => {
    getCpuSerial(result => resolve(result));
  });
}

function getMotherboardSerialAsync() {
  return new Promise((resolve, reject) => {
    getMotherboardSerial(result => resolve(result));
  });
}

function getHardDiskSerialAsync() {
  return new Promise((resolve, reject) => {
    getHardDiskSerial(result => resolve(result));
  });
}

// 生成机器码（使用SHA-256替代MD5）
// 注意：更改此算法会导致旧的机器码失效
// 迁移策略：需要重新激活所有用户的应用
function generateMachineCode(hardwareInfo) {
  const rawCodeString = `${hardwareInfo.mac}-${hardwareInfo.cpu}-${hardwareInfo.hardDisk}-${hardwareInfo.motherboard}`;
  // 使用SHA-256而不是MD5（更安全、更难碰撞）
  return crypto.createHash('sha256').update(rawCodeString).digest('hex');
}

// 用于向后兼容的MD5机器码生成（用于验证旧激活码）
function generateMachineCodeMD5(hardwareInfo) {
  const rawCodeString = `${hardwareInfo.mac}-${hardwareInfo.cpu}-${hardwareInfo.hardDisk}-${hardwareInfo.motherboard}`;
  return crypto.createHash('md5').update(rawCodeString).digest('hex');
}

exports.getHardwareInfo = getHardwareInfo;
exports.generateMachineCode = generateMachineCode;
exports.generateMachineCodeMD5 = generateMachineCodeMD5;