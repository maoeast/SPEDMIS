const { app, BrowserWindow, shell, ipcMain, Menu, BrowserView } = require('electron');
const path = require('path');
const fs = require('fs');
const hardware = require('./hardware');
const config = require('./config');
const { getGlobalCacheManager } = require('./cache');
const { getLogger } = require('./logger');
const productNameManager = require('./modules/product-name-manager');
const logoHandler = require('./modules/logo-handler');
const usageStats = require('./modules/usage-stats');
const permissionManager = require('./modules/permission-manager');
const secretManager = require('./modules/secret-manager');
const activationCrypto = require('./modules/activation-crypto');
const vmDetector = require('./modules/vm-detector');

let mainWindow;
let psyseenView = null;  // AI 心理测验 BrowserView（已废弃，保留兼容）
let psyseenWindow = null;  // AI 心理测验独立窗口
const logger = getLogger('MAIN');

function createWindow() {
  // 创建无标题栏窗口
  const windowConfig_ = config.windowConfig.main;
  mainWindow = new BrowserWindow(windowConfig_);

  // 设置空菜单以隐藏默认菜单栏
  Menu.setApplicationMenu(null);

  // 检查激活状态
  checkActivationStatus().then(isActivated => {
    if (isActivated) {
      mainWindow.loadFile('index.html');
    } else {
      mainWindow.loadFile('activation.html');
    }
  });

  // 打开外部链接
  mainWindow.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });

  // 添加网络请求拦截器以支持图标加载
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    let responseHeaders = details.responseHeaders || {};

    // 强制添加MIME类型支持
    if (details.url.endsWith('.png') && (!responseHeaders['Content-Type'] || responseHeaders['Content-Type'][0].includes('text/html'))) {
      responseHeaders['Content-Type'] = ['image/png'];
    }

    // 可以为其他静态资源添加类似的MIME类型处理
    callback({ cancel: false, responseHeaders: responseHeaders });
  });
}

// 检查本地激活记录
async function checkActivationStatus() {
  try {
    const storagePath = config.getActivationStoragePath();
    logger.debug('Checking activation status', { path: storagePath });

    const activationDataString = await fs.promises.readFile(storagePath, 'utf8');
    const activationData = JSON.parse(activationDataString);

    // 验证机器码是否匹配
    return new Promise((resolve, reject) => {
      hardware.getHardwareInfo(hardwareInfo => {
        const machineCode = hardware.generateMachineCode(hardwareInfo);
        // 检查是否什么一次的激活存储（有可能是encrypted或machineCode）
        const savedMachineCode = activationData.machineCode || 'saved_once';
        const isActivated = machineCode === savedMachineCode;
        logger.info('Activation check completed', { activated: isActivated, machineCode: machineCode.substring(0, 8) + '...' });
        resolve(isActivated);
      });
    });
  } catch (err) {
    logger.warn('Activation status check failed', { error: err.message });
    return false;
  }
}

// IPC通信处理
ipcMain.handle(config.ipcChannels.activate, async (event, arg) => {
  logger.info('Activation request received');

  return new Promise((resolve, reject) => {
    hardware.getHardwareInfo(hardwareInfo => {
      const machineCode = hardware.generateMachineCode(hardwareInfo);

      // 验证激活码
      if (arg.activationCode.length !== config.activationConfig.activationCodeLength) {
        const error = config.logMessages.activation.codeFormatInvalid;
        logger.warn('Activation code format invalid', { receivedLength: arg.activationCode.length });
        reject(new Error(error));
        return;
      }

      // 验证激活码与机器码的匹配关系
      // 使用密钥管理器获取SECRET_KEY（不再硬编码）
      const crypto = require('crypto');
      const secretKey = secretManager.getActivationSecretKey();
      const hmac = crypto.createHmac(config.activationConfig.hashAlgorithm, secretKey);
      hmac.update(machineCode);
      const expectedActivationCode = hmac.digest('hex');

      if (arg.activationCode !== expectedActivationCode) {
        const error = config.logMessages.activation.codeInvalid;
        logger.warn('Activation code mismatch', { expected: expectedActivationCode.substring(0, 8) + '...', received: arg.activationCode.substring(0, 8) + '...' });
        reject(new Error(error));
        return;
      }

      const storagePath = config.getActivationStoragePath();

      // 保存激活信息（使用AES-256-GCM加密）
      const activationData = {
        machineCode: machineCode,
        activationCode: arg.activationCode,
        activatedDate: new Date().toISOString(),
        deviceLedger: hardwareInfo
      };

      // 加密激活信息
      let encryptedData;
      try {
        encryptedData = activationCrypto.encryptActivationData(activationData);
      } catch (encryptError) {
        logger.error('Failed to encrypt activation data', { error: encryptError.message });
        reject(new Error('加密激活信息失败'));
        return;
      }

      logger.info('Saving activation information');
      fs.promises.mkdir(path.dirname(storagePath), { recursive: true })
        .then(() => {
          // 保存激活信息，同时包含机器码和加密数据
          const activationFileContent = {
            machineCode: machineCode,  // 清文机器码（用于检查下次启动）
            activationCode: arg.activationCode,  // 清文激活码
            activatedDate: new Date().toISOString(),
            encrypted: encryptedData  // 加密的详细信息
          };
          return fs.promises.writeFile(storagePath, JSON.stringify(activationFileContent));
        })
        .then(() => {
          logger.info('Activation information saved successfully');
          // 激活成功，让前端处理界面跳转
          resolve({ success: true });
        })
        .catch(err => {
          logger.error('Failed to save activation information', { error: err.message });
          reject(new Error(config.logMessages.activation.failedToSaveActivationInfo));
        });
    });
  });
});

// 获取机器码
ipcMain.on(config.ipcChannels.getMachineCode, (event) => {
  logger.debug('Machine code request received');
  hardware.getHardwareInfo(hardwareInfo => {
    const machineCode = hardware.generateMachineCode(hardwareInfo);
    logger.debug('Machine code generated', { code: machineCode.substring(0, 8) + '...' });
    event.reply(config.ipcChannels.machineCodeResponse, machineCode);
  });
});

// 获取模块分类数据
ipcMain.on(config.ipcChannels.getModuleCategories, async (event, domain) => {
  try {
    logger.info('Module categories request received', { domain });

    // 使用缓存模块来获取已加载过的 apps.json
    const cache = getGlobalCacheManager();
    let apps = cache.get('apps.json');

    if (!apps) {
      logger.debug('Apps data not in cache, loading from file');
      const appsJsonPath = path.join(app.getAppPath(), 'apps.json');
      const data = await fs.promises.readFile(appsJsonPath, 'utf8');
      apps = JSON.parse(data);
      // 缓存 apps.json 数据，简化下次使用
      cache.set('apps.json', apps, 3600000); // TTL: 1 小时
      logger.debug('Apps data cached');
    }

    // 按领域筛选并收集二级目录
    const categories = {};
    const normalizedDomain = domain.replace(/领域$/, '');

    const filteredApps = Object.values(apps).filter(app => {
      const appDomain = app.领域 || '';
      return appDomain === normalizedDomain || appDomain === domain;
    });

    logger.debug('Filtered apps', { domain, count: filteredApps.length });

    filteredApps.forEach(app => {
      if (!categories[app.子功能]) {
        categories[app.子功能] = [];
      }
      categories[app.子功能].push(app);
    });

    logger.info('Module categories generated', { domain, categoryCount: Object.keys(categories).length });
    event.reply(config.ipcChannels.moduleCategoriesResponse, categories);
  } catch (err) {
    logger.error('Failed to get module categories', { domain, error: err.message });
    event.reply(config.ipcChannels.moduleCategoriesError, err.message);
  }
});

// 启动应用程序
ipcMain.handle(config.ipcChannels.launchApplication, async (event, appPath) => {
  const { execFile } = require('child_process');
  logger.info('Application launch request received', { path: appPath });

  return new Promise((resolve, reject) => {
    execFile(appPath, (error, stdout, stderr) => {
      if (error) {
        logger.error('Application launch failed', { path: appPath, error: error.message });
        reject({ success: false, error: error.message });
        return;
      }
      logger.info('Application launched successfully', { path: appPath });
      resolve({ success: true });
    });
  });
});

app.whenReady().then(async () => {
  // 初始化密钥管理器（必须在其他模块之前）
  secretManager.initialize();
  logger.info('Secret manager initialized');

  // 初始化虚拟机检测
  vmDetector.detectVirtualMachine((vmResult) => {
    if (vmResult.isVirtualMachine && process.env.ENABLE_VM_DETECTION !== 'false') {
      logger.warn('Application is running in a virtual machine', {
        indicators: vmResult.indicators,
        confidence: vmResult.confidence
      });
      // 可选：在生产环境中拒绝在虚拟机中运行
      // if (process.env.NODE_ENV === 'production') {
      //   logger.error('Application cannot run in virtual machine');
      //   app.quit();
      //   return;
      // }
    }
  });

  // 初始化产品名称管理器
  productNameManager.initialize();
  // 初始化 Logo 处理器
  logoHandler.initialize();
  // 初始化使用统计模块（异步作业）
  await usageStats.initialize();
  // 初始化权限管理器
  await permissionManager.initializePermissions();
  createWindow();
});

app.on('window-all-closed', () => {
  // 清理使用统计数据库连接
  usageStats.closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    productNameManager.initialize();
    createWindow();
  }
});

// 处理关闭应用程序的IPC消息
ipcMain.handle(config.ipcChannels.closeApplication, async (event) => {
  try {
    logger.info('Application close request received');
    app.quit();
    return { success: true };
  } catch (error) {
    logger.error('Application close failed', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 获取产品名称配置
ipcMain.handle(config.ipcChannels.getProductName, async (event) => {
  try {
    logger.debug('Product name request received');
    const productConfig = productNameManager.getProductNameConfig();
    return { success: true, data: productConfig };
  } catch (error) {
    logger.error('Failed to get product name', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 设置产品名称配置
ipcMain.handle(config.ipcChannels.setProductName, async (event, newConfig) => {
  try {
    logger.info('Product name update request received', {
      fullName: newConfig.fullName,
      shortName: newConfig.shortName
    });
    const updatedConfig = productNameManager.setProductNameConfig(newConfig);
    return { success: true, data: updatedConfig };
  } catch (error) {
    logger.error('Failed to set product name', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 获取完整的产品配置
ipcMain.handle(config.ipcChannels.getProductConfig, async (event) => {
  try {
    logger.debug('Product config request received');
    const productConfig = productNameManager.getProductNameConfig();
    return { success: true, data: productConfig };
  } catch (error) {
    logger.error('Failed to get product config', { error: error.message });
    return { success: false, error: error.message };
  }
});

// ===== Logo 相关 IPC 处理 =====

// 上传 Logo
ipcMain.handle(config.ipcChannels.uploadLogo, async (event, filePath) => {
  try {
    logger.info('Logo upload request received', { path: filePath });
    const result = logoHandler.saveLogo(filePath);
    return { success: true, data: result };
  } catch (error) {
    logger.error('Failed to upload logo', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 获取 Logo 列表
ipcMain.handle(config.ipcChannels.getLogosList, async (event) => {
  try {
    logger.debug('Logos list request received');
    const logos = logoHandler.getLogosList();
    return { success: true, data: logos };
  } catch (error) {
    logger.error('Failed to get logos list', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 删除 Logo
ipcMain.handle(config.ipcChannels.deleteLogo, async (event, fileName) => {
  try {
    logger.info('Logo delete request received', { fileName });
    logoHandler.deleteLogo(fileName);
    return { success: true };
  } catch (error) {
    logger.error('Failed to delete logo', { error: error.message });
    return { success: false, error: error.message };
  }
});

// ===== 使用统计相关 IPC 处理 =====

// 记录使用开始
ipcMain.handle(config.ipcChannels.recordUsageStart, async (event, appData) => {
  try {
    logger.debug('Usage start record request received', { appName: appData.appName });
    const result = await usageStats.recordUsageStart(appData);
    return { success: true, data: result };
  } catch (error) {
    logger.error('Failed to record usage start', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 记录使用结数
ipcMain.handle(config.ipcChannels.recordUsageEnd, async (event, recordData) => {
  try {
    logger.debug('Usage end record request received', { recordId: recordData.recordId });
    const result = await usageStats.recordUsageEnd(recordData);
    return { success: true, data: result };
  } catch (error) {
    logger.error('Failed to record usage end', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 获取使用统计
ipcMain.handle(config.ipcChannels.getUsageStats, async (event, filters) => {
  try {
    logger.debug('Usage stats request received', { filters });
    const stats = await usageStats.getUsageStats(filters);
    return { success: true, data: stats };
  } catch (error) {
    logger.error('Failed to get usage statistics', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 清除使用统计
ipcMain.handle(config.ipcChannels.clearUsageStats, async (event, filters) => {
  try {
    logger.info('Usage stats clear request received', { filters });
    const result = await usageStats.clearUsageStats(filters);
    return { success: true, data: result };
  } catch (error) {
    logger.error('Failed to clear usage statistics', { error: error.message });
    return { success: false, error: error.message };
  }
});

// ===== 权限管理相关 IPC 处理 =====

// 验证管理员密码
ipcMain.handle(config.ipcChannels.verifyAdminPassword, async (event, password) => {
  try {
    logger.info('Admin password verification request received');
    const result = permissionManager.verifyAdminPassword(password);
    return result;
  } catch (error) {
    logger.error('Failed to verify admin password', { error: error.message });
    return { success: false, message: error.message };
  }
});

// 检查权限
ipcMain.handle(config.ipcChannels.checkPermission, async (event, data) => {
  try {
    const { action, token } = data;
    logger.debug('Permission check request received', { action });
    const result = permissionManager.checkPermission(action, token);
    return result;
  } catch (error) {
    logger.error('Failed to check permission', { error: error.message });
    return { allowed: false, message: error.message };
  }
});

// 注销会话
ipcMain.handle(config.ipcChannels.revokeSession, async (event, token) => {
  try {
    logger.info('Session revoke request received');
    const result = permissionManager.revokeSession(token);
    return { success: result };
  } catch (error) {
    logger.error('Failed to revoke session', { error: error.message });
    return { success: false };
  }
});

// 更新管理员密码
ipcMain.handle(config.ipcChannels.updateAdminPassword, async (event, data) => {
  try {
    const { oldPassword, newPassword } = data;
    logger.info('Admin password update request received');
    const result = permissionManager.updateAdminPassword(oldPassword, newPassword);
    return result;
  } catch (error) {
    logger.error('Failed to update admin password', { error: error.message });
    return { success: false, message: error.message };
  }
});

// ===== AI 心理测验 - psyseen.com 集成 =====

// psyseen 登录 - 支持两种模式：独立窗口和主窗口 BrowserView
ipcMain.handle('psyseen-login', async (event, { username, password, redirectUrl }) => {
  try {
    logger.info('Psyseen login request received', { username });
    
    // 获取调用者的窗口
    const callerWindow = BrowserWindow.fromWebContents(event.sender);
    
    // 检查是否是独立窗口调用
    const isIndependentWindow = (callerWindow === psyseenWindow);
    
    if (isIndependentWindow) {
      // 独立窗口模式：直接在当前窗口中加载 dashboard 并自动登录
      logger.info('Login from independent window mode');
      
      // 等待页面完全加载
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 自动填充表单并提交
      const submitResult = await callerWindow.webContents.executeJavaScript(`
        (function() {
          return new Promise((resolve) => {
            var usernameInput = document.querySelector('input[type="text"], input[type="email"], input[name="username"], input[id="username"]');
            var passwordInput = document.querySelector('input[type="password"], input[name="password"], input[id="password"]');
            
            if (!usernameInput || !passwordInput) {
              resolve({ success: false, error: 'Form fields not found' });
              return;
            }
            
            var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(usernameInput, '${username.replace(/'/g, "\\'")}');
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            nativeInputValueSetter.call(passwordInput, '${password.replace(/'/g, "\\'")}');
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            setTimeout(() => {
              var loginButton = document.querySelector('button[type="submit"], button[class*="login"], button[class*="submit"], input[type="submit"], .btn-login, .el-button--primary');
              
              if (!loginButton) {
                var buttons = document.querySelectorAll('button, [role="button"]');
                for (var i = 0; i < buttons.length; i++) {
                  if (buttons[i].textContent.includes('登录')) {
                    loginButton = buttons[i];
                    break;
                  }
                }
              }
              
              if (loginButton) {
                loginButton.click();
                resolve({ success: true, message: 'Login form submitted' });
              } else {
                resolve({ success: false, error: 'Login button not found' });
              }
            }, 500);
          });
        })();
      `);
      
      logger.info('Psyseen login form submitted in independent window', { result: submitResult });
      return { success: true };
    } else {
      // 主窗口 BrowserView 模式（保留向后兼容）
      logger.info('Login from main window BrowserView mode (deprecated)');
      
      // 如果已有 BrowserView，先关闭
      if (psyseenView) {
        mainWindow.removeBrowserView(psyseenView);
        psyseenView.webContents.destroy();
        psyseenView = null;
      }
      
      // 创建隐藏的 BrowserView（先不添加到窗口）
      const hiddenView = new BrowserView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload.js')
        }
      });
      
      // 设置为全屏大小（用于后台加载）
      const { width, height } = mainWindow.getBounds();
      hiddenView.setBounds({ x: 0, y: 0, width, height });
      
      // 监听导航事件，检测是否登录成功（跳转到 dashboard）
      let loginCompleted = false;
      
      const checkLoginComplete = (event, url) => {
        logger.debug('BrowserView navigation', { url });
        // 检测是否已跳转到 dashboard（登录成功标志）
        if (url.includes('/dashboard') || url.includes('#/dashboard')) {
          loginCompleted = true;
          logger.info('Psyseen login completed, showing view');
          
          // 登录成功，添加到窗口显示
          mainWindow.setBrowserView(hiddenView);
          
          // 移除监听器
          hiddenView.webContents.removeListener('did-navigate', checkLoginComplete);
          hiddenView.webContents.removeListener('did-navigate-in-page', checkLoginComplete);
        }
      };
      
      hiddenView.webContents.on('did-navigate', checkLoginComplete);
      hiddenView.webContents.on('did-navigate-in-page', checkLoginComplete);
      
      // 加载登录页
      await hiddenView.webContents.loadURL(redirectUrl);
      
      // 等待页面完全加载
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 自动填充表单并提交
      const submitResult = await hiddenView.webContents.executeJavaScript(`
        (function() {
          return new Promise((resolve) => {
            var usernameInput = document.querySelector('input[type="text"], input[type="email"], input[name="username"], input[id="username"]');
            var passwordInput = document.querySelector('input[type="password"], input[name="password"], input[id="password"]');
            
            if (!usernameInput || !passwordInput) {
              resolve({ success: false, error: 'Form fields not found' });
              return;
            }
            
            var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(usernameInput, '${username.replace(/'/g, "\\'")}');
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            nativeInputValueSetter.call(passwordInput, '${password.replace(/'/g, "\\'")}');
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            setTimeout(() => {
              var loginButton = document.querySelector('button[type="submit"], button[class*="login"], button[class*="submit"], input[type="submit"], .btn-login, .el-button--primary');
              
              if (!loginButton) {
                var buttons = document.querySelectorAll('button, [role="button"]');
                for (var i = 0; i < buttons.length; i++) {
                  if (buttons[i].textContent.includes('登录')) {
                    loginButton = buttons[i];
                    break;
                  }
                }
              }
              
              if (loginButton) {
                loginButton.click();
                resolve({ success: true, message: 'Login form submitted' });
              } else {
                resolve({ success: false, error: 'Login button not found' });
              }
            }, 500);
          });
        })();
      `);
      
      logger.info('Psyseen login form submitted', { result: submitResult });
      
      // 等待登录完成并跳转（最多等待 10 秒）
      for (let i = 0; i < 20; i++) {
        if (loginCompleted) {
          psyseenView = hiddenView;
          
          // 确保 BrowserView 大小正确
          setTimeout(() => {
            const { width, height } = mainWindow.getBounds();
            psyseenView.setBounds({ x: 0, y: 0, width, height });
          }, 500);
          
          return { success: true };
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // 超时，可能已经登录成功了，直接显示
      logger.warn('Psyseen login timeout, showing view anyway');
      psyseenView = hiddenView;
      mainWindow.setBrowserView(hiddenView);
      return { success: true };
    }
  } catch (error) {
    logger.error('Failed to login to psyseen', { error: error.message });
    return { success: false, error: error.message };
  }
});
        })();
      `);
      
      logger.info('Psyseen login form submitted in independent window');
      return { success: true };
    } else {
      // 主窗口 BrowserView 模式（保留向后兼容）
      logger.info('Login from main window BrowserView mode (deprecated)');
      
      // 如果已有 BrowserView，先关闭
      if (psyseenView) {
        mainWindow.removeBrowserView(psyseenView);
        psyseenView.webContents.destroy();
        psyseenView = null;
      }
      
      // 创建隐藏的 BrowserView（先不添加到窗口）
      const hiddenView = new BrowserView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload.js')
        }
      });
      
      // 设置为全屏大小（用于后台加载）
      const { width, height } = mainWindow.getBounds();
      hiddenView.setBounds({ x: 0, y: 0, width, height });
      
      // 监听导航事件，检测是否登录成功（跳转到 dashboard）
      let loginCompleted = false;
      
      const checkLoginComplete = (event, url) => {
        logger.debug('BrowserView navigation', { url });
        // 检测是否已跳转到 dashboard（登录成功标志）
        if (url.includes('/dashboard') || url.includes('#/dashboard')) {
          loginCompleted = true;
          logger.info('Psyseen login completed, showing view');
          
          // 登录成功，添加到窗口显示
          mainWindow.setBrowserView(hiddenView);
          
          // 移除监听器
          hiddenView.webContents.removeListener('did-navigate', checkLoginComplete);
          hiddenView.webContents.removeListener('did-navigate-in-page', checkLoginComplete);
        }
      };
      
      hiddenView.webContents.on('did-navigate', checkLoginComplete);
      hiddenView.webContents.on('did-navigate-in-page', checkLoginComplete);
      
      // 加载登录页
      await hiddenView.webContents.loadURL(redirectUrl);
      
      // 等待页面完全加载
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 自动填充表单并提交（代码同上，省略）
      const submitResult = await hiddenView.webContents.executeJavaScript(`
        (function() {
          return new Promise((resolve) => {
            var usernameInput = document.querySelector('input[type="text"], input[type="email"], input[name="username"], input[id="username"]');
            var passwordInput = document.querySelector('input[type="password"], input[name="password"], input[id="password"]');
            
            if (!usernameInput || !passwordInput) {
              resolve({ success: false, error: 'Form fields not found' });
              return;
            }
            
            var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(usernameInput, '${username.replace(/'/g, "\\'")}');
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            nativeInputValueSetter.call(passwordInput, '${password.replace(/'/g, "\\'")}');
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            setTimeout(() => {
              var loginButton = document.querySelector('button[type="submit"], button[class*="login"], button[class*="submit"], input[type="submit"], .btn-login, .el-button--primary');
              
              if (!loginButton) {
                var buttons = document.querySelectorAll('button, [role="button"]');
                for (var i = 0; i < buttons.length; i++) {
                  if (buttons[i].textContent.includes('登录')) {
                    loginButton = buttons[i];
                    break;
                  }
                }
              }
              
              if (loginButton) {
                loginButton.click();
                resolve({ success: true, message: 'Login form submitted' });
              } else {
                resolve({ success: false, error: 'Login button not found' });
              }
            }, 500);
          });
        })();
      `);
      
      logger.info('Psyseen login form submitted', { result: submitResult });
      
      // 等待登录完成并跳转（最多等待 10 秒）
      for (let i = 0; i < 20; i++) {
        if (loginCompleted) {
          psyseenView = hiddenView;
          
          // 确保 BrowserView 大小正确
          setTimeout(() => {
            const { width, height } = mainWindow.getBounds();
            psyseenView.setBounds({ x: 0, y: 0, width, height });
          }, 500);
          
          return { success: true };
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // 超时，可能已经登录成功了，直接显示
      logger.warn('Psyseen login timeout, showing view anyway');
      psyseenView = hiddenView;
      mainWindow.setBrowserView(hiddenView);
      return { success: true };
    }
  } catch (error) {
    logger.error('Failed to login to psyseen', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 加载 psyseen dashboard（用于独立窗口或主窗口）
ipcMain.handle('psyseen-load-view', async (event) => {
  try {
    logger.info('Psyseen load view request received');
    
    // 获取调用者的窗口
    const callerWindow = BrowserWindow.fromWebContents(event.sender);
    
    if (callerWindow === psyseenWindow) {
      // 独立窗口模式：直接在窗口中加载 dashboard
      logger.info('Loading dashboard in independent window');
      await callerWindow.webContents.loadURL('https://org.psyseen.com/#/dashboard');
    } else {
      // 主窗口 BrowserView 模式（保留向后兼容）
      if (psyseenView) {
        // 调整 BrowserView 大小以适应窗口
        const { width, height } = mainWindow.getBounds();
        psyseenView.setBounds({ x: 0, y: 0, width, height });
      }
    }
    
    logger.info('Psyseen dashboard loaded successfully');
    return { success: true };
  } catch (error) {
    logger.error('Failed to load psyseen dashboard', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 关闭 psyseen BrowserView 并返回主页
ipcMain.handle('psyseen-close-view', async (event) => {
  try {
    logger.info('Psyseen close view request received');
    
    if (psyseenView) {
      mainWindow.removeBrowserView(psyseenView);
      psyseenView.webContents.destroy();
      psyseenView = null;
      logger.info('Psyseen BrowserView closed successfully');
    }
    
    return { success: true };
  } catch (error) {
    logger.error('Failed to close psyseen BrowserView', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 检查 psyseen BrowserView 是否存在（用于判断是否已登录）
ipcMain.handle('psyseen-check-view', async (event) => {
  try {
    const exists = psyseenView !== null;
    logger.debug('Psyseen check view', { exists });
    return { exists };
  } catch (error) {
    logger.error('Failed to check psyseen view', { error: error.message });
    return { exists: false };
  }
});

// 打开 psyseen dashboard（用于从首页直接进入已登录的 dashboard，已废弃）
ipcMain.handle('psyseen-open-dashboard', async (event) => {
  try {
    logger.info('Psyseen open dashboard request received (deprecated)');
    
    // 如果已有 BrowserView，先关闭
    if (psyseenView) {
      mainWindow.removeBrowserView(psyseenView);
      psyseenView.webContents.destroy();
      psyseenView = null;
    }
    
    // 创建 BrowserView
    psyseenView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    mainWindow.setBrowserView(psyseenView);
    
    // 设置 BrowserView 位置（全屏）
    const { width, height } = mainWindow.getBounds();
    psyseenView.setBounds({ x: 0, y: 0, width, height });
    
    // 直接加载 dashboard（用户需要已登录）
    await psyseenView.webContents.loadURL('https://org.psyseen.com/#/dashboard');
    
    logger.info('Psyseen dashboard opened successfully');
    return { success: true };
  } catch (error) {
    logger.error('Failed to open psyseen dashboard', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 打开 psyseen.com 独立窗口（新窗口，最大化）
ipcMain.handle('psyseen-open-window', async (event) => {
  try {
    logger.info('Psyseen open window request received');
    
    // 如果窗口已存在，聚焦并返回
    if (psyseenWindow) {
      psyseenWindow.focus();
      return { success: true };
    }
    
    // 创建新窗口（显示登录页面）
    psyseenWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      show: true,
      frame: true,  // 显示窗口边框和标题栏
      hasShadow: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    // 窗口创建后最大化
    psyseenWindow.maximize();
    
    // 加载本地登录页面
    psyseenWindow.loadFile('psy-login.html');
    
    // 监听窗口关闭事件
    psyseenWindow.on('closed', () => {
      logger.info('Psyseen window closed');
      psyseenWindow = null;
    });
    
    logger.info('Psyseen window created and maximized');
    return { success: true };
  } catch (error) {
    logger.error('Failed to open psyseen window', { error: error.message });
    return { success: false, error: error.message };
  }
});

// 关闭 psyseen 独立窗口
ipcMain.handle('psyseen-close-window', async (event) => {
  try {
    logger.info('Psyseen close window request received');
    
    if (psyseenWindow) {
      psyseenWindow.close();
      psyseenWindow = null;
      logger.info('Psyseen window closed successfully');
    }
    
    return { success: true };
  } catch (error) {
    logger.error('Failed to close psyseen window', { error: error.message });
    return { success: false, error: error.message };
  }
});
