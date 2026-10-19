const os = require('os');
const { exec, execFile } = require('child_process');
const crypto = require('crypto');

const HARDWARE_COMMAND_TIMEOUTS = {
  wmic: 4000,
  powershell: 10000,
  shell: 8000,
};
const HARDWARE_COLLECTION_TIMEOUT_MS = 15000;
const MAX_COMMAND_BUFFER = 1024 * 1024;

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

function normalizeCommandResult(error, stdout, startedAt) {
  return {
    ok: !error,
    stdout: String(stdout || ''),
    error: error || null,
    timedOut: !!(error && (error.killed || error.signal)),
    durationMs: Date.now() - startedAt,
  };
}

function runHardwareCommand(spec, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const options = {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: MAX_COMMAND_BUFFER,
    };

    const handleResult = (error, stdout) => {
      resolve(normalizeCommandResult(error, stdout, startedAt));
    };

    if (spec.file) {
      execFile(spec.file, spec.args || [], options, handleResult);
      return;
    }

    exec(spec.command, options, handleResult);
  });
}

function parseFirstNonEmptyLine(stdout) {
  const line = String(stdout || '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .find(Boolean);

  return line ? line.replace(/\s+/g, '') : '';
}

function parseWmicField(stdout, headerPattern) {
  const value = parseWindowsWmicValues(stdout, headerPattern)[0];
  return value ? value.replace(/\s+/g, '') : '';
}

async function runAttempts(attempts, fallback, context) {
  const results = [];

  for (const attempt of attempts) {
    const timeoutMs = context.timeouts[attempt.timeoutKey] || HARDWARE_COMMAND_TIMEOUTS.shell;
    const result = await context.commandRunner(attempt.spec, timeoutMs);
    const value = result.ok && typeof attempt.parse === 'function'
      ? attempt.parse(result.stdout)
      : '';

    results.push({
      label: attempt.spec.label,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      resolved: !!value,
    });

    if (value) {
      return { value, source: attempt.spec.label, attempts: results };
    }
  }

  return { value: fallback, source: 'none', attempts: results };
}

async function collectCpuSerial(context) {
  if (process.platform === 'win32') {
    return runAttempts([
      {
        timeoutKey: 'wmic',
        spec: {
          label: 'cpu-wmic',
          file: 'wmic.exe',
          args: ['cpu', 'get', 'ProcessorId'],
        },
        parse: stdout => parseWmicField(stdout, /^processorid$/i),
      },
      {
        timeoutKey: 'powershell',
        spec: {
          label: 'cpu-powershell',
          file: 'powershell.exe',
          args: [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '(Get-CimInstance Win32_Processor | Select-Object -First 1).ProcessorId',
          ],
        },
        parse: parseFirstNonEmptyLine,
      },
    ], 'UNKNOWN_CPU', context);
  }

  if (process.platform === 'linux') {
    const primary = await context.commandRunner({
      label: 'cpu-linux',
      command: 'cat /proc/cpuinfo 2>/dev/null | grep "model name" | head -1',
    }, context.timeouts.shell);

    if (primary.ok && primary.stdout.trim()) {
      const cpuModel = primary.stdout.trim().replace(/model name\s*:\s*/i, '').trim();

      if (cpuModel) {
        const cores = await context.commandRunner({
          label: 'cpu-linux-cores',
          command: 'cat /proc/cpuinfo 2>/dev/null | grep "cpu cores" | head -1',
        }, context.timeouts.shell);
        const cpuCores = cores.ok && cores.stdout.trim()
          ? cores.stdout.trim().replace(/cpu cores\s*:\s*/i, '').trim()
          : '';

        return {
          value: `${cpuModel}${cpuCores ? `-${cpuCores}cores` : ''}`,
          source: 'cpu-linux',
          attempts: [],
        };
      }
    }

    return runAttempts([
      {
        timeoutKey: 'shell',
        spec: {
          label: 'cpu-linux-dmidecode',
          command: 'dmidecode -t processor 2>/dev/null | grep "ID" | head -1',
        },
        parse: (stdout) => {
          const value = stdout.trim().replace(/ID:\s*/i, '').trim();
          return value && value !== 'None' ? value : '';
        },
      },
    ], 'UNKNOWN_CPU', context);
  }

  return runAttempts([
    {
      timeoutKey: 'shell',
      spec: {
        label: 'cpu-darwin',
        command: 'sysctl -n machdep.cpu.brand_string',
      },
      parse: stdout => stdout.trim(),
    },
  ], 'UNKNOWN_CPU', context);
}

async function collectMotherboardSerial(context) {
  if (process.platform === 'win32') {
    return runAttempts([
      {
        timeoutKey: 'wmic',
        spec: {
          label: 'mb-wmic',
          file: 'wmic.exe',
          args: ['baseboard', 'get', 'serialnumber'],
        },
        parse: stdout => parseWmicField(stdout, /^serialnumber$/i),
      },
      {
        timeoutKey: 'powershell',
        spec: {
          label: 'mb-powershell',
          file: 'powershell.exe',
          args: [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            '(Get-CimInstance Win32_BaseBoard | Select-Object -First 1).SerialNumber',
          ],
        },
        parse: (stdout) => {
          const value = parseFirstNonEmptyLine(stdout);
          return value && value !== 'None' && value !== 'NotSpecified' ? value : '';
        },
      },
    ], 'UNKNOWN_MB', context);
  }

  if (process.platform === 'linux') {
    return runAttempts([
      {
        timeoutKey: 'shell',
        spec: {
          label: 'mb-linux-dmidecode',
          command: 'dmidecode -t baseboard 2>/dev/null | grep "Serial Number" | head -1',
        },
        parse: (stdout) => {
          const value = stdout.trim().replace(/Serial Number:\s*/i, '').trim();
          return value && value !== 'None' && value !== 'Not Specified' ? value : '';
        },
      },
      {
        timeoutKey: 'shell',
        spec: {
          label: 'mb-linux-lshw',
          command: 'lshw -c motherboard 2>/dev/null | grep "serial:" | head -1',
        },
        parse: stdout => stdout.trim().replace(/serial:\s*/i, '').trim(),
      },
    ], 'UNKNOWN_MB', context);
  }

  return runAttempts([
    {
      timeoutKey: 'shell',
      spec: {
        label: 'mb-darwin',
        command: 'system_profiler SPHardwareDataType | grep "Model Identifier"',
      },
      parse: (stdout) => {
        const match = stdout.match(/Model Identifier:\s*(.+)/i);
        return match ? match[1].trim() : '';
      },
    },
  ], 'UNKNOWN_MB', context);
}

async function collectHardDiskSerial(context) {
  if (process.platform === 'win32') {
    return runAttempts([
      {
        timeoutKey: 'powershell',
        spec: {
          label: 'disk-powershell',
          file: 'powershell.exe',
          args: [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            'Get-CimInstance Win32_DiskDrive | Select-Object Index,InterfaceType,MediaType,Model,PNPDeviceID,SerialNumber | ConvertTo-Json -Compress',
          ],
        },
        parse: (stdout) => {
          const preferred = choosePreferredWindowsDisk(parseWindowsDiskInventory(stdout));
          return preferred === 'UNKNOWN_HD' ? '' : preferred;
        },
      },
      {
        timeoutKey: 'wmic',
        spec: {
          label: 'disk-wmic',
          file: 'wmic.exe',
          args: ['diskdrive', 'get', 'SerialNumber'],
        },
        parse: (stdout) => {
          const preferred = choosePreferredDiskSerial(parseWindowsDiskSerials(stdout));
          return preferred === 'UNKNOWN_HD' ? '' : preferred;
        },
      },
    ], 'UNKNOWN_HD', context);
  }

  if (process.platform === 'linux') {
    return runAttempts([
      {
        timeoutKey: 'shell',
        spec: {
          label: 'disk-linux',
          command: 'lsblk -nd -o SERIAL /dev/sda 2>/dev/null || hdparm -I /dev/sda 2>/dev/null | grep "Serial Number" || cat /sys/block/sda/serial 2>/dev/null',
        },
        parse: (stdout) => {
          const serials = parseWindowsDiskSerials(stdout);
          return serials[0] || '';
        },
      },
      {
        timeoutKey: 'shell',
        spec: {
          label: 'disk-linux-dmidecode',
          command: 'dmidecode -t disk 2>/dev/null | grep -A1 "Serial Number" | tail -1',
        },
        parse: stdout => stdout.trim(),
      },
    ], 'UNKNOWN_HD', context);
  }

  return runAttempts([
    {
      timeoutKey: 'shell',
      spec: {
        label: 'disk-darwin',
        command: 'ioreg -l | grep IOPlatformSerialNumber',
      },
      parse: (stdout) => {
        const match = stdout.match(/"([^"]+)"$/m);
        return match ? match[1].trim() : '';
      },
    },
  ], 'UNKNOWN_HD', context);
}

function getHardwareInfo(callback, options = {}) {
  const commandRunner = typeof options.commandRunner === 'function'
    ? options.commandRunner
    : runHardwareCommand;
  const timeouts = {
    ...HARDWARE_COMMAND_TIMEOUTS,
    ...(options.commandTimeouts || {}),
  };
  const overallTimeoutMs = Number.isFinite(options.overallTimeoutMs)
    ? options.overallTimeoutMs
    : HARDWARE_COLLECTION_TIMEOUT_MS;
  const context = { commandRunner, timeouts };
  const startedAt = Date.now();

  const hardware = {
    mac: getMacAddress(),
    stableMac: getStableMacAddress(),
  };

  let completed = false;
  let guardTimer = null;

  const finish = (incomplete, fields) => {
    if (completed) {
      return;
    }

    completed = true;
    if (guardTimer) {
      clearTimeout(guardTimer);
      guardTimer = null;
    }

    hardware.capture = {
      incomplete,
      durationMs: Date.now() - startedAt,
      fields,
    };

    callback(hardware);
  };

  guardTimer = setTimeout(() => {
    finish(true, {
      cpu: hardware.cpu ? 'complete' : 'pending',
      motherboard: hardware.motherboard ? 'complete' : 'pending',
      hardDisk: hardware.hardDisk ? 'complete' : 'pending',
    });
  }, overallTimeoutMs);

  if (guardTimer && typeof guardTimer.unref === 'function') {
    guardTimer.unref();
  }

  Promise.all([
    collectCpuSerial(context),
    collectMotherboardSerial(context),
    collectHardDiskSerial(context),
  ])
    .then(([cpu, motherboard, hardDisk]) => {
      hardware.cpu = cpu.value;
      hardware.motherboard = motherboard.value;
      hardware.hardDisk = hardDisk.value;
      hardware.stableHardDisk = hardDisk.value;

      finish(false, {
        cpu: { source: cpu.source, attempts: cpu.attempts },
        motherboard: { source: motherboard.source, attempts: motherboard.attempts },
        hardDisk: { source: hardDisk.source, attempts: hardDisk.attempts },
      });
    })
    .catch((error) => {
      finish(true, { error: error ? error.message : 'hardware collection failed' });
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
exports.HARDWARE_COMMAND_TIMEOUTS = HARDWARE_COMMAND_TIMEOUTS;
exports.HARDWARE_COLLECTION_TIMEOUT_MS = HARDWARE_COLLECTION_TIMEOUT_MS;
