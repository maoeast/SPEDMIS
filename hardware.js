const os = require('os');
const { exec } = require('child_process');
const crypto = require('crypto');

function normalizeHardwareValue(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return normalized || fallback;
}

function selectStableMacAddress(hardwareInfo = {}) {
  return normalizeHardwareValue(hardwareInfo.stableMac || hardwareInfo.mac, 'UNKNOWN_MAC');
}

function selectStableHardDiskSerial(hardwareInfo = {}) {
  return normalizeHardwareValue(hardwareInfo.stableHardDisk || hardwareInfo.hardDisk, 'UNKNOWN_HD');
}

function createMachineCodePayload(hardwareInfo = {}, options = {}) {
  const useStableIdentifiers = options.useStableIdentifiers !== false;
  const mac = useStableIdentifiers
    ? selectStableMacAddress(hardwareInfo)
    : normalizeHardwareValue(hardwareInfo.mac, 'UNKNOWN_MAC');
  const hardDisk = useStableIdentifiers
    ? selectStableHardDiskSerial(hardwareInfo)
    : normalizeHardwareValue(hardwareInfo.hardDisk, 'UNKNOWN_HD');
  const cpu = normalizeHardwareValue(hardwareInfo.cpu, 'UNKNOWN_CPU');
  const motherboard = normalizeHardwareValue(hardwareInfo.motherboard, 'UNKNOWN_MB');

  return `${mac}-${cpu}-${hardDisk}-${motherboard}`;
}

function hashMachineCode(rawCodeString, algorithm = 'sha256') {
  return crypto.createHash(algorithm).update(rawCodeString).digest('hex');
}

function getMacAddress() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const item of interfaces[name]) {
      if (item.mac && item.mac !== '00:00:00:00:00:00') {
        return item.mac.replace(/:/g, '').toUpperCase();
      }
    }
  }

  return 'UNKNOWN_MAC';
}

function getStableMacAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, items] of Object.entries(interfaces)) {
    for (const item of items || []) {
      if (!item || !item.mac || item.mac === '00:00:00:00:00:00' || item.internal) {
        continue;
      }

      const normalizedName = String(name).toLowerCase();
      const normalizedMac = item.mac.replace(/:/g, '').toUpperCase();
      const family = String(item.family || '');
      const isWireless = /wi-?fi|wireless|wlan|802\.11/.test(normalizedName);
      const isVirtual = /virtual|vmware|hyper-v|vethernet|docker|vbox|bluetooth|loopback|tap|tun/.test(normalizedName);
      const score = isVirtual ? 2 : isWireless ? 1 : 0;

      candidates.push({
        mac: normalizedMac,
        score,
        name: normalizedName,
        family,
      });
    }
  }

  if (candidates.length === 0) {
    return 'UNKNOWN_MAC';
  }

  candidates.sort((left, right) => {
    if (left.score !== right.score) {
      return left.score - right.score;
    }

    if (left.name !== right.name) {
      return left.name.localeCompare(right.name);
    }

    if (left.family !== right.family) {
      return left.family.localeCompare(right.family);
    }

    return left.mac.localeCompare(right.mac);
  });

  return candidates[0].mac;
}

function parseWindowsDiskSerials(stdout) {
  return stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^serialnumber$/i.test(line))
    .map(line => line.replace(/\s+/g, ''))
    .filter(line => line.length >= 4);
}

function parseWindowsWmicValues(stdout, headerPattern) {
  return stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !(headerPattern && headerPattern.test(line)));
}

function parseWindowsDiskInventory(stdout) {
  try {
    const parsed = JSON.parse(stdout.trim());
    const disks = Array.isArray(parsed) ? parsed : [parsed];

    return disks
      .map(disk => ({
        index: Number.isFinite(Number(disk.Index)) ? Number(disk.Index) : Number.MAX_SAFE_INTEGER,
        interfaceType: normalizeHardwareValue(disk.InterfaceType, ''),
        mediaType: normalizeHardwareValue(disk.MediaType, ''),
        model: normalizeHardwareValue(disk.Model, ''),
        pnpDeviceId: normalizeHardwareValue(disk.PNPDeviceID, ''),
        serialNumber: normalizeHardwareValue(disk.SerialNumber, '').replace(/\s+/g, ''),
      }))
      .filter(disk => disk.serialNumber.length >= 4);
  } catch (error) {
    return [];
  }
}

function choosePreferredWindowsDisk(disks) {
  if (!Array.isArray(disks) || disks.length === 0) {
    return 'UNKNOWN_HD';
  }

  const ranked = disks
    .map(disk => {
      const externalInterface = /usb|1394|sd/i.test(disk.interfaceType);
      const removableMedia = /removable/i.test(disk.mediaType);
      const removablePnp = /usbstor|sdstor/i.test(disk.pnpDeviceId);
      const removableModel = /usb|card reader|sd|flash/i.test(disk.model);

      let score = 0;
      if (externalInterface) score += 100;
      if (removableMedia) score += 100;
      if (removablePnp) score += 100;
      if (removableModel) score += 50;
      score += Number.isFinite(disk.index) ? disk.index : 25;

      return {
        ...disk,
        score,
      };
    })
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      if (left.index !== right.index) {
        return left.index - right.index;
      }

      if (left.serialNumber.length !== right.serialNumber.length) {
        return right.serialNumber.length - left.serialNumber.length;
      }

      return left.serialNumber.localeCompare(right.serialNumber);
    });

  return ranked[0].serialNumber;
}

function choosePreferredDiskSerial(serials) {
  if (!Array.isArray(serials) || serials.length === 0) {
    return 'UNKNOWN_HD';
  }

  const ranked = serials
    .map(serial => ({
      serial,
      score: /usb|sd|card|reader|removable/i.test(serial) ? 1 : 0,
    }))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      if (left.serial.length !== right.serial.length) {
        return right.serial.length - left.serial.length;
      }

      return left.serial.localeCompare(right.serial);
    });

  return ranked[0].serial;
}

function getHardDiskSerial(callback) {
  if (process.platform === 'win32') {
    exec('powershell -NoProfile -Command "Get-CimInstance Win32_DiskDrive | Select-Object Index,InterfaceType,MediaType,Model,PNPDeviceID,SerialNumber | ConvertTo-Json -Compress"', (error, stdout) => {
      if (!error && stdout.trim()) {
        const disks = parseWindowsDiskInventory(stdout);
        const preferredDisk = choosePreferredWindowsDisk(disks);

        if (preferredDisk !== 'UNKNOWN_HD') {
          callback(preferredDisk);
          return;
        }
      }

      exec('wmic diskdrive get SerialNumber', (fallbackError, fallbackStdout) => {
        if (!fallbackError) {
          const serials = parseWindowsDiskSerials(fallbackStdout);
          const preferredSerial = choosePreferredDiskSerial(serials);

          if (preferredSerial !== 'UNKNOWN_HD') {
            callback(preferredSerial);
            return;
          }
        }

        callback('UNKNOWN_HD');
      });
    });
  } else if (process.platform === 'linux') {
    exec('lsblk -nd -o SERIAL /dev/sda 2>/dev/null || hdparm -I /dev/sda 2>/dev/null | grep "Serial Number" || cat /sys/block/sda/serial 2>/dev/null', (error, stdout) => {
      if (!error && stdout.trim()) {
        const serials = parseWindowsDiskSerials(stdout);
        if (serials.length > 0) {
          callback(serials[0]);
          return;
        }
      }

      exec('dmidecode -t disk 2>/dev/null | grep -A1 "Serial Number" | tail -1', (error2, stdout2) => {
        if (!error2 && stdout2.trim()) {
          callback(stdout2.trim());
          return;
        }

        callback('UNKNOWN_HD');
      });
    });
  } else {
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

function getMotherboardSerial(callback) {
  if (process.platform === 'win32') {
    exec('wmic baseboard get serialnumber', (error, stdout) => {
      if (!error) {
        const values = parseWindowsWmicValues(stdout, /^serialnumber$/i);
        const serial = values[0] ? values[0].replace(/\s+/g, '') : '';
        if (serial) {
          callback(serial);
          return;
        }
      }

      callback('UNKNOWN_MB');
    });
  } else if (process.platform === 'linux') {
    exec('dmidecode -t baseboard 2>/dev/null | grep "Serial Number" | head -1', (error, stdout) => {
      if (!error && stdout.trim()) {
        const serial = stdout.trim().replace(/Serial Number:\s*/i, '').trim();
        if (serial && serial !== 'None' && serial !== 'Not Specified') {
          callback(serial);
          return;
        }
      }

      exec('lshw -c motherboard 2>/dev/null | grep "serial:" | head -1', (error2, stdout2) => {
        if (!error2 && stdout2.trim()) {
          const serial = stdout2.trim().replace(/serial:\s*/i, '').trim();
          if (serial) {
            callback(serial);
            return;
          }
        }

        callback('UNKNOWN_MB');
      });
    });
  } else {
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

function getCpuSerial(callback) {
  if (process.platform === 'win32') {
    exec('wmic cpu get ProcessorId', (error, stdout) => {
      if (!error) {
        const values = parseWindowsWmicValues(stdout, /^processorid$/i);
        const serial = values[0] ? values[0].replace(/\s+/g, '') : '';
        if (serial) {
          callback(serial);
          return;
        }
      }

      callback('UNKNOWN_CPU');
    });
  } else if (process.platform === 'linux') {
    exec('cat /proc/cpuinfo 2>/dev/null | grep "model name" | head -1', (error, stdout) => {
      if (!error && stdout.trim()) {
        const cpuModel = stdout.trim().replace(/model name\s*:\s*/i, '').trim();
        if (cpuModel) {
          exec('cat /proc/cpuinfo 2>/dev/null | grep "cpu cores" | head -1', (error2, stdout2) => {
            let cpuCores = '';
            if (!error2 && stdout2.trim()) {
              cpuCores = stdout2.trim().replace(/cpu cores\s*:\s*/i, '').trim();
            }
            callback(`${cpuModel}${cpuCores ? `-${cpuCores}cores` : ''}`);
          });
          return;
        }
      }

      exec('dmidecode -t processor 2>/dev/null | grep "ID" | head -1', (error3, stdout3) => {
        if (!error3 && stdout3.trim()) {
          const cpuId = stdout3.trim().replace(/ID:\s*/i, '').trim();
          if (cpuId && cpuId !== 'None') {
            callback(cpuId);
            return;
          }
        }

        callback('UNKNOWN_CPU');
      });
    });
  } else {
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

function getHardwareInfo(callback) {
  const hardware = {};
  let completed = false;

  const timeout = setTimeout(() => {
    if (!completed) {
      completed = true;
      callback(hardware);
    }
  }, 5000);

  hardware.mac = getMacAddress();
  hardware.stableMac = getStableMacAddress();

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
      hardware.stableHardDisk = hd;
      if (!completed) {
        completed = true;
        clearTimeout(timeout);
        callback(hardware);
      }
    })
    .catch(() => {
      if (!completed) {
        completed = true;
        clearTimeout(timeout);
        callback(hardware);
      }
    });
}

function getCpuSerialAsync() {
  return new Promise((resolve) => {
    getCpuSerial(result => resolve(result));
  });
}

function getMotherboardSerialAsync() {
  return new Promise((resolve) => {
    getMotherboardSerial(result => resolve(result));
  });
}

function getHardDiskSerialAsync() {
  return new Promise((resolve) => {
    getHardDiskSerial(result => resolve(result));
  });
}

function generateMachineCode(hardwareInfo) {
  return hashMachineCode(createMachineCodePayload(hardwareInfo));
}

function getMachineCodeCandidates(hardwareInfo) {
  const candidates = [
    generateMachineCode(hardwareInfo),
    hashMachineCode(createMachineCodePayload(hardwareInfo, { useStableIdentifiers: false })),
  ];

  return [...new Set(candidates)];
}

function generateMachineCodeMD5(hardwareInfo) {
  return hashMachineCode(createMachineCodePayload(hardwareInfo), 'md5');
}

exports.getHardwareInfo = getHardwareInfo;
exports.generateMachineCode = generateMachineCode;
exports.getMachineCodeCandidates = getMachineCodeCandidates;
exports.generateMachineCodeMD5 = generateMachineCodeMD5;
