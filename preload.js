const { contextBridge, ipcRenderer } = require('electron');

// 注意: appIconMap 应被在渲染进程中运用，通过preload脚本暴露
// appIconMap 将被preload脚本直接暴露给渲染进程
// 注意：这里不能require('./config')，因为会导致循环依赖
// 所以我们直接从硬编码的appIconMap中引入
const appIconMap = {
  'APP001.png': 'gjcj.png', 'APP002.png': 'gjcj.png', 'APP003.png': 'gjcj.png', 'APP004.png': 'gjcj.png',
  'APP005.png': 'gjcj.png', 'APP006.png': 'gjcj.png', 'APP007.png': 'gjcj.png', 'APP008.png': 'gjcj.png',
  'APP009.png': 'gjcj.png', 'APP010.png': 'gjcj.png', 'APP011.png': 'gjcj.png', 'APP012.png': 'gjcj.png',
  'APP013.png': 'gjcj.png', 'APP014.png': 'gjcj.png', 'APP015.png': 'gjcj.png', 'APP016.png': 'gjcj.png',
  'APP017.png': 'gjcj.png', 'APP018.png': 'gjcj.png', 'APP019.png': 'gjcj.png', 'APP020.png': 'gjcj.png',
  'APP021.png': 'gjcj.png', 'APP022.png': 'gjcj.png', 'APP023.png': 'gjcj.png', 'APP024.png': 'gjcj.png',
  'APP025.png': 'gjcj.png', 'APP026.png': 'gjcj.png', 'APP027.png': 'gjcj.png', 'APP028.png': 'gjcj.png',
  'APP029.png': 'gjcj.png', 'APP030.png': 'gjcj.png', 'APP031.png': 'gjcj.png', 'APP032.png': 'gjcj.png',
  'APP033.png': 'gjcj.png', 'APP034.png': 'gjcj.png', 'APP035.png': 'gjcj.png', 'APP036.png': 'gjcj.png',
  'APP037.png': 'gjcj.png', 'APP038.png': 'gjcj.png', 'APP039.png': 'gjcj.png', 'APP040.png': 'gjcj.png',
  'APP041.png': 'gjcj.png', 'APP042.png': 'gjcj.png', 'APP043.png': 'gjcj.png', 'APP044.png': 'gjcj.png',
  'APP045.png': 'gjcj.png', 'APP046.png': 'gjcj.png', 'APP047.png': 'gjcj.png', 'APP048.png': 'gjcj.png',
  'APP049.png': 'gjcj.png', 'APP050.png': 'gjcj.png', 'APP051.png': 'gjcj.png', 'APP052.png': 'gjcj.png',
  'APP053.png': 'gjcj.png', 'APP054.png': 'gjcj.png', 'APP055.png': 'gjcj.png', 'APP056.png': 'gjcj.png',
  'APP057.png': 'gjcj.png', 'APP058.png': 'gjcj.png',
  'APP059.png': 'sdzh.png', 'APP060.png': 'sdzh.png', 'APP061.png': 'sdzh.png', 'APP062.png': 'sdzh.png',
  'APP063.png': 'sdzh.png', 'APP064.png': 'sdzh.png', 'APP065.png': 'sdzh.png', 'APP066.png': 'sdzh.png',
  'APP067.png': 'sdzh.png', 'APP068.png': 'sdzh.png', 'APP069.png': 'sdzh.png', 'APP070.png': 'sdzh.png',
  'APP071.png': 'sdzh.png', 'APP072.png': 'sdzh.png', 'APP073.png': 'sdzh.png', 'APP074.png': 'sdzh.png',
  'APP075.png': 'sdzh.png', 'APP076.png': 'sdzh.png', 'APP077.png': 'sdzh.png', 'APP078.png': 'sdzh.png',
  'APP079.png': 'sdzh.png', 'APP080.png': 'sdzh.png', 'APP081.png': 'sdzh.png', 'APP082.png': 'sdzh.png',
  'APP083.png': 'ysbd.png', 'APP084.png': 'ysbd.png', 'APP085.png': 'ysbd.png', 'APP086.png': 'ysbd.png',
  'APP087.png': 'ysbd.png', 'APP088.png': 'ysbd.png', 'APP089.png': 'ysbd.png', 'APP090.png': 'ysbd.png',
  'APP091.png': 'ysbd.png', 'APP092.png': 'ysbd.png', 'APP093.png': 'ysbd.png', 'APP094.png': 'ysbd.png',
  'APP095.png': 'ysbd.png', 'APP096.png': 'ysbd.png', 'APP097.png': 'ysbd.png', 'APP098.png': 'ysbd.png',
  'APP099.png': 'ysbd.png', 'APP100.png': 'ysbd.png', 'APP101.png': 'ysbd.png', 'APP102.png': 'ysbd.png',
  'APP103.png': 'ysbd.png', 'APP104.png': 'ysbd.png', 'APP105.png': 'ysbd.png', 'APP106.png': 'ysbd.png',
  'APP107.png': 'ysbd.png', 'APP108.png': 'ysbd.png', 'APP109.png': 'ysbd.png', 'APP110.png': 'ysbd.png',
  'APP111.png': 'ysbd.png', 'APP112.png': 'ysbd.png', 'APP113.png': 'ysbd.png', 'APP114.png': 'ysbd.png',
  'APP115.png': 'ysbd.png', 'APP116.png': 'ysbd.png', 'APP117.png': 'ysbd.png', 'APP118.png': 'ysbd.png',
  'APP119.png': 'ysbd.png', 'APP120.png': 'ysbd.png',
  'APP121.png': 'jyqh.png', 'APP122.png': 'jyqh.png', 'APP123.png': 'jyqh.png', 'APP124.png': 'jyqh.png',
  'APP125.png': 'jyqh.png', 'APP126.png': 'jyqh.png', 'APP127.png': 'jyqh.png', 'APP128.png': 'jyqh.png',
  'APP129.png': 'jyqh.png', 'APP130.png': 'jyqh.png', 'APP131.png': 'jyqh.png', 'APP132.png': 'jyqh.png',
  'APP133.png': 'jyqh.png',
  'APP134.png': 'xlzl.png', 'APP135.png': 'xlzl.png', 'APP136.png': 'xlzl.png', 'APP137.png': 'xlzl.png',
  'APP138.png': 'xlzl.png', 'APP139.png': 'xlzl.png', 'APP140.png': 'xlzl.png', 'APP141.png': 'xlzl.png',
  'APP142.png': 'xlzl.png', 'APP143.png': 'xlzl.png', 'APP144.png': 'xlzl.png', 'APP145.png': 'xlzl.png',
  'APP146.png': 'xlzl.png', 'APP147.png': 'xlzl.png', 'APP148.png': 'xlzl.png',
  'APP149.png': 'dwdf.png', 'APP150.png': 'dwdf.png', 'APP151.png': 'dwdf.png', 'APP152.png': 'dwdf.png',
  'APP153.png': 'dwdf.png', 'APP154.png': 'dwdf.png', 'APP155.png': 'dwdf.png', 'APP156.png': 'dwdf.png',
  'APP157.png': 'dwdf.png',
  'APP158.png': 'glzh.png', 'APP159.png': 'glzh.png', 'APP160.png': 'glzh.png', 'APP161.png': 'glzh.png',
  'APP162.png': 'glzh.png', 'APP163.png': 'glzh.png', 'APP164.png': 'glzh.png', 'APP165.png': 'glzh.png',
  'APP166.png': 'glzh.png', 'APP167.png': 'glzh.png',
  'APP168.png': 'txcl.png', 'APP169.png': 'txcl.png', 'APP170.png': 'txcl.png', 'APP171.png': 'txcl.png',
  'APP172.png': 'txcl.png', 'APP173.png': 'txcl.png', 'APP174.png': 'txcl.png', 'APP175.png': 'txcl.png',
  'APP176.png': 'txcl.png', 'APP177.png': 'txcl.png', 'APP178.png': 'txcl.png', 'APP179.png': 'txcl.png',
  'APP180.png': 'txcl.png', 'APP181.png': 'txcl.png', 'APP182.png': 'txcl.png', 'APP183.png': 'txcl.png',
  'APP184.png': 'wtjj.png', 'APP185.png': 'wtjj.png', 'APP186.png': 'wtjj.png', 'APP187.png': 'wtjj.png',
  'APP188.png': 'wtjj.png', 'APP189.png': 'wtjj.png', 'APP190.png': 'wtjj.png', 'APP191.png': 'wtjj.png',
  'APP192.png': 'wtjj.png', 'APP193.png': 'wtjj.png',
  'APP194.png': 'xzjd.png', 'APP195.png': 'xzjd.png', 'APP196.png': 'xzjd.png', 'APP197.png': 'xzjd.png',
  'APP198.png': 'xzjd.png', 'APP199.png': 'xzjd.png', 'APP200.png': 'xzjd.png', 'APP201.png': 'xzjd.png',
  'APP202.png': 'xzjd.png', 'APP203.png': 'xzjd.png', 'APP204.png': 'xzjd.png', 'APP205.png': 'xzjd.png',
  'APP206.png': 'xzjd.png', 'APP207.png': 'xzjd.png', 'APP208.png': 'xzjd.png', 'APP209.png': 'xzjd.png',
  'APP210.png': 'xzjd.png', 'APP211.png': 'xzjd.png', 'APP212.png': 'xzjd.png', 'APP213.png': 'xzjd.png',
  'APP214.png': 'xzjd.png', 'APP215.png': 'xzjd.png', 'APP216.png': 'xzjd.png', 'APP217.png': 'xzjd.png',
  'APP218.png': 'xzjd.png', 'APP219.png': 'xzjd.png', 'APP220.png': 'xzjd.png', 'APP221.png': 'xzjd.png',
  'APP222.png': 'xzjd.png', 'APP223.png': 'xzjd.png', 'APP224.png': 'xzjd.png', 'APP225.png': 'xzjd.png',
  'APP226.png': 'xzjd.png', 'APP227.png': 'xzjd.png', 'APP228.png': 'xzjd.png', 'APP229.png': 'xzjd.png',
  'APP230.png': 'xzjd.png', 'APP231.png': 'xzjd.png', 'APP232.png': 'xzjd.png', 'APP233.png': 'xzjd.png',
  'APP234.png': 'xzjd.png', 'APP235.png': 'xzjd.png', 'APP236.png': 'xzjd.png', 'APP237.png': 'xzjd.png',
  'APP238.png': 'xzjd.png', 'APP239.png': 'xzjd.png', 'APP240.png': 'xzjd.png', 'APP241.png': 'xzjd.png',
  'APP242.png': 'xzjd.png', 'APP243.png': 'xzjd.png', 'APP244.png': 'xzjd.png', 'APP245.png': 'xzjd.png',
  'APP246.png': 'xzjd.png', 'APP247.png': 'xzjd.png', 'APP248.png': 'xzjd.png', 'APP249.png': 'xzjd.png',
  'APP250.png': 'xzjd.png', 'APP251.png': 'xzjd.png', 'APP252.png': 'xzjd.png', 'APP253.png': 'xzjd.png',
  'APP254.png': 'xzjd.png', 'APP255.png': 'xzjd.png', 'APP256.png': 'xzjd.png', 'APP257.png': 'xzjd.png',
  'APP258.png': 'gznh.png', 'APP259.png': 'gznh.png', 'APP260.png': 'gznh.png', 'APP261.png': 'gznh.png',
  'APP262.png': 'gznh.png', 'APP263.png': 'gznh.png', 'APP264.png': 'gznh.png', 'APP265.png': 'gznh.png',
  'APP266.png': 'gznh.png', 'APP267.png': 'gznh.png', 'APP268.png': 'gznh.png', 'APP269.png': 'gznh.png',
  'APP270.png': 'gznh.png', 'APP271.png': 'gznh.png', 'APP272.png': 'gznh.png', 'APP273.png': 'gznh.png',
  'APP274.png': 'gznh.png', 'APP275.png': 'gznh.png', 'APP276.png': 'gznh.png', 'APP277.png': 'gznh.png',
  'APP278.png': 'gznh.png',
  'APP279.png': 'hdqf.png', 'APP280.png': 'hdqf.png', 'APP281.png': 'hdqf.png', 'APP282.png': 'hdqf.png',
  'APP283.png': 'hdqf.png', 'APP284.png': 'hdqf.png', 'APP285.png': 'hdqf.png', 'APP286.png': 'hdqf.png',
  'APP287.png': 'hdqf.png', 'APP288.png': 'hdqf.png', 'APP289.png': 'hdqf.png', 'APP290.png': 'hdqf.png',
  'APP291.png': 'hdqf.png', 'APP292.png': 'hdqf.png', 'APP293.png': 'hdqf.png', 'APP294.png': 'hdqf.png',
  'APP295.png': 'hdqf.png', 'APP296.png': 'hdqf.png', 'APP297.png': 'hdqf.png', 'APP298.png': 'hdqf.png',
  'APP299.png': 'hdqf.png', 'APP300.png': 'hdqf.png', 'APP301.png': 'hdqf.png', 'APP302.png': 'hdqf.png',
  'APP303.png': 'hdqf.png', 'APP304.png': 'hdqf.png', 'APP305.png': 'hdqf.png', 'APP306.png': 'hdqf.png',
  'APP307.png': 'hdqf.png', 'APP308.png': 'hdqf.png', 'APP309.png': 'hdqf.png', 'APP310.png': 'hdqf.png',
  'APP311.png': 'hdqf.png', 'APP312.png': 'hdqf.png', 'APP313.png': 'hdqf.png', 'APP314.png': 'hdqf.png',
  'APP315.png': 'hdqf.png', 'APP316.png': 'hdqf.png', 'APP317.png': 'hdqf.png', 'APP318.png': 'hdqf.png',
  'APP319.png': 'hdqf.png', 'APP320.png': 'hdqf.png', 'APP321.png': 'hdqf.png',
  'APP322.png': 'aqhf.png', 'APP323.png': 'aqhf.png', 'APP324.png': 'aqhf.png', 'APP325.png': 'aqhf.png',
  'APP326.png': 'aqhf.png', 'APP327.png': 'aqhf.png', 'APP328.png': 'aqhf.png', 'APP329.png': 'aqhf.png',
  'APP330.png': 'aqhf.png', 'APP331.png': 'aqhf.png', 'APP332.png': 'aqhf.png', 'APP333.png': 'aqhf.png',
  'APP334.png': 'aqhf.png', 'APP335.png': 'aqhf.png', 'APP336.png': 'aqhf.png', 'APP337.png': 'aqhf.png',
  'APP338.png': 'aqhf.png', 'APP339.png': 'aqhf.png',
  'APP340.png': 'shjn.png', 'APP341.png': 'shjn.png', 'APP342.png': 'shjn.png', 'APP343.png': 'shjn.png',
  'APP344.png': 'shjn.png', 'APP345.png': 'shjn.png', 'APP346.png': 'shjn.png', 'APP347.png': 'shjn.png',
  'APP348.png': 'shjn.png', 'APP349.png': 'shjn.png', 'APP350.png': 'shjn.png', 'APP351.png': 'shjn.png',
  'APP352.png': 'shjn.png', 'APP353.png': 'shjn.png', 'APP354.png': 'shjn.png', 'APP355.png': 'shjn.png',
  'APP356.png': 'shjn.png', 'APP357.png': 'shjn.png', 'APP358.png': 'shjn.png', 'APP359.png': 'shjn.png',
  'APP360.png': 'shjn.png', 'APP361.png': 'shjn.png', 'APP362.png': 'hjrh.png', 'APP363.png': 'hjrh.png',
  'APP364.png': 'hjrh.png', 'APP365.png': 'hjrh.png', 'APP366.png': 'hjrh.png', 'APP367.png': 'hjrh.png',
  'APP368.png': 'hjrh.png', 'APP369.png': 'hjrh.png', 'APP370.png': 'hjrh.png', 'APP371.png': 'hjrh.png',
  'APP372.png': 'hjrh.png', 'APP373.png': 'hjrh.png', 'APP374.png': 'hjrh.png',
  'APP375.png': 'zwtj.png', 'APP376.png': 'zwtj.png', 'APP377.png': 'zwtj.png', 'APP378.png': 'zwtj.png',
  'APP379.png': 'zwtj.png', 'APP380.png': 'zwtj.png', 'APP381.png': 'zwtj.png', 'APP382.png': 'zwtj.png',
  'APP383.png': 'zwtj.png', 'APP384.png': 'zwtj.png', 'APP385.png': 'zwtj.png', 'APP386.png': 'zwtj.png',
  'APP387.png': 'zwtj.png', 'APP388.png': 'zwtj.png', 'APP389.png': 'zwtj.png', 'APP390.png': 'zwtj.png',
  'APP391.png': 'zwtj.png', 'APP392.png': 'zwtj.png', 'APP393.png': 'zwtj.png', 'APP394.png': 'zwtj.png',
  'APP395.png': 'zwtj.png', 'APP396.png': 'zwtj.png', 'APP397.png': 'zwtj.png', 'APP398.png': 'zwtj.png',
  'APP399.png': 'qxgl.png', 'APP400.png': 'qxgl.png', 'APP401.png': 'qxgl.png', 'APP402.png': 'qxgl.png',
  'APP403.png': 'qxgl.png', 'APP404.png': 'qxgl.png', 'APP405.png': 'qxgl.png', 'APP406.png': 'qxgl.png',
  'APP407.png': 'qxgl.png', 'APP408.png': 'qxgl.png', 'APP409.png': 'qxgl.png', 'APP410.png': 'qxgl.png',
  'APP411.png': 'qxgl.png', 'APP412.png': 'qxgl.png', 'APP413.png': 'qxgl.png', 'APP414.png': 'qxgl.png',
  'APP415.png': 'qxgl.png', 'APP416.png': 'qxgl.png', 'APP417.png': 'qxgl.png', 'APP418.png': 'qxgl.png'
};
function handleIpcError(operationName, error, reject) {
  console.error(`[IPC Error] ${operationName}:`, error.message || error);
  if (reject) {
    reject(new Error(`Failed to perform ${operationName}: ${error.message || 'Unknown error'}`));
  }
}

// 暴露应用配置到渲染进程
contextBridge.exposeInMainWorld('appConfig', {
  appIconMap: appIconMap // 使用定义的appIconMap
});

// 安全的IPC通信
contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing code ...
  activate: (data) => {
    return ipcRenderer
      .invoke('activate', data)
      .catch((error) =>
        handleIpcError('activate', error, null)
      );
  },
  getMachineCode: () => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ipcRenderer.removeAllListeners('machine-code-response');
        handleIpcError('getMachineCode', new Error('Timeout'), reject);
      }, 5000); // 5秒超时

      ipcRenderer.once('machine-code-response', (event, machineCode) => {
        clearTimeout(timeout);
        resolve(machineCode);
      });

      ipcRenderer.once('error', (event, errorMessage) => {
        clearTimeout(timeout);
        handleIpcError('getMachineCode', new Error(errorMessage), reject);
      });

      ipcRenderer.send('get-machine-code');
    });
  },
  getModuleCategories: (domain) => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ipcRenderer.removeAllListeners('module-categories-response');
        ipcRenderer.removeAllListeners('module-categories-error');
        handleIpcError('getModuleCategories', new Error('Timeout'), reject);
      }, 5000);

      ipcRenderer.once('module-categories-response', (event, categories) => {
        clearTimeout(timeout);
        resolve(categories);
      });

      ipcRenderer.once('module-categories-error', (event, errorMessage) => {
        clearTimeout(timeout);
        handleIpcError('getModuleCategories', new Error(errorMessage), reject);
      });

      ipcRenderer.send('get-module-categories', domain);
    });
  },
  launchApplication: (appPath) => {
    return ipcRenderer
      .invoke('launch-application', appPath)
      .catch((error) => {
        handleIpcError('launchApplication', error, null);
        throw error; // 重新抛出错误，以便在渲染进程中捕获
      });
  },
  closeApplication: () => {
    return ipcRenderer
      .invoke('close-application')
      .catch((error) => {
        handleIpcError('closeApplication', error, null);
        throw error; // 重新抛出错误，以便在渲染进程中捕获
      });
  },
  getProductName: () => {
    return ipcRenderer
      .invoke('get-product-name')
      .catch((error) => {
        handleIpcError('getProductName', error, null);
        throw error;
      });
  },
  setProductName: (newConfig) => {
    return ipcRenderer
      .invoke('set-product-name', newConfig)
      .catch((error) => {
        handleIpcError('setProductName', error, null);
        throw error;
      });
  },
  getProductConfig: () => {
    return ipcRenderer
      .invoke('get-product-config')
      .catch((error) => {
        handleIpcError('getProductConfig', error, null);
        throw error;
      });
  },
  // Logo 相关 API
  uploadLogo: (filePath) => {
    return ipcRenderer
      .invoke('upload-logo', filePath)
      .catch((error) => {
        handleIpcError('uploadLogo', error, null);
        throw error;
      });
  },
  getLogosList: () => {
    return ipcRenderer
      .invoke('get-logos-list')
      .catch((error) => {
        handleIpcError('getLogosList', error, null);
        throw error;
      });
  },
  deleteLogo: (fileName) => {
    return ipcRenderer
      .invoke('delete-logo', fileName)
      .catch((error) => {
        handleIpcError('deleteLogo', error, null);
        throw error;
      });
  },
  // 使用统计相关 API
  recordUsageStart: (appData) => {
    return ipcRenderer
      .invoke('record-usage-start', appData)
      .catch((error) => {
        handleIpcError('recordUsageStart', error, null);
        throw error;
      });
  },
  recordUsageEnd: (recordData) => {
    return ipcRenderer
      .invoke('record-usage-end', recordData)
      .catch((error) => {
        handleIpcError('recordUsageEnd', error, null);
        throw error;
      });
  },
  getUsageStats: (filters) => {
    return ipcRenderer
      .invoke('get-usage-stats', filters)
      .catch((error) => {
        handleIpcError('getUsageStats', error, null);
        throw error;
      });
  },
  clearUsageStats: (filters) => {
    return ipcRenderer
      .invoke('clear-usage-stats', filters)
      .catch((error) => {
        handleIpcError('clearUsageStats', error, null);
        throw error;
      });
  },
  // 权限管理 API
  verifyAdminPassword: (password) => {
    return ipcRenderer
      .invoke('verify-admin-password', password)
      .catch((error) => {
        handleIpcError('verifyAdminPassword', error, null);
        throw error;
      });
  },
  checkPermission: (action, token) => {
    return ipcRenderer
      .invoke('check-permission', { action, token })
      .catch((error) => {
        handleIpcError('checkPermission', error, null);
        throw error;
      });
  },
  revokeSession: (token) => {
    return ipcRenderer
      .invoke('revoke-session', token)
      .catch((error) => {
        handleIpcError('revokeSession', error, null);
        throw error;
      });
  },
  updateAdminPassword: (oldPassword, newPassword) => {
    return ipcRenderer
      .invoke('update-admin-password', { oldPassword, newPassword })
      .catch((error) => {
        handleIpcError('updateAdminPassword', error, null);
        throw error;
      });
  }
});