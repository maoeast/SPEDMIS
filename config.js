/**
 * 配置管理模块
 * 统一管理应用的硬编码配置、常量和映射表
 */

const path = require('path');
const { app } = require('electron');

/**
 * 应用基础配置
 */
const appConfig = {
    name: '特殊教育多模态干预系统',
    version: '1.0.0',
    shortName: '特教MIS',
};

/**
 * 产品名称配置
 * 支持动态自定义产品显示名称
 */
const productNameConfig = {
    // 默认产品名称配置
    defaults: {
        fullName: '特殊教育多模态干预系统',
        shortName: '特教MIS',
        engName: 'Special Education Multimodal Intervention System',
        organization: '杭州炫灿科技有限公司',
        copyright: '©2013-2025',
        version: '1.0.0',
    },
    // 配置文件名称
    configFileName: 'product-branding.json',
    // 配置存储目录
    configDirName: 'config',
};

/**
 * Logo 配置
 * 支持上传和自定义应用 Logo
 */
const logoConfig = {
    // 支持的图片格式
    supportedFormats: ['.png', '.jpg', '.jpeg', '.gif', '.ico'],
    // 最大文件大小 (2MB)
    maxFileSize: 2 * 1024 * 1024,
    // Logo 存储目录
    logoDirName: 'logos',
};

/**
 * 获取产品名称配置文件路径
 */
function getProductNameConfigPath() {
    let storagePath;

    if (process.platform === 'win32') {
        storagePath = path.join(
            app.getPath('appData'),
            activationConfig.appDataDirName,
            productNameConfig.configDirName,
            productNameConfig.configFileName
        );
    } else {
        storagePath = path.join(
            app.getPath('home'),
            'Library',
            'Application Support',
            activationConfig.appDataDirName,
            productNameConfig.configDirName,
            productNameConfig.configFileName
        );
    }

    return storagePath;
}

/**
 * 窗口配置
 */
const windowConfig = {
    main: {
        width: 1024,
        height: 768,
        resizable: false,
        frame: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false,
            devTools: true,  // 启用开发者工具
        },
    },
};

/**
 * 激活系统配置
 * 
 * 注意：secretKey现在由密钥管理器动态加载
 * 不再硬编码在此文件中
 */
const activationConfig = {
    appDataDirName: '特殊教育多模态干预系统',
    activationFileName: 'activation.json',
    // secretKey将在运行时由secret-manager.js提供
    // 不在此处硬编码
    activationCodeLength: 64,
    hashAlgorithm: 'sha256',  // 注意：已升级到SHA-256
};

/**
 * 获取激活信息存储路径
 * @returns {string} 激活信息文件路径
 */
function getActivationStoragePath() {
    let storagePath;

    if (process.platform === 'win32') {
        storagePath = path.join(
            app.getPath('appData'),
            activationConfig.appDataDirName,
            activationConfig.activationFileName
        );
    } else {
        storagePath = path.join(
            app.getPath('home'),
            'Library',
            'Application Support',
            activationConfig.appDataDirName,
            activationConfig.activationFileName
        );
    }

    return storagePath;
}

/**
 * 日志配置
 */
const loggingConfig = {
    levels: {
        ERROR: 'error',
        WARN: 'warn',
        INFO: 'info',
        DEBUG: 'debug',
    },
    defaultLevel: 'info',
    format: {
        timestamp: true,
        level: true,
        module: true,
    },
    // 根据环境设置日志级别
    productionLevel: 'warn',
    developmentLevel: 'debug',
};

/**
 * 日志信息模板映射
 * 便于国际化和统一管理日志文案
 */
const logMessages = {
    // 激活相关
    activation: {
        codeVerifying: '正在验证激活码...',
        codeVerified: '激活码验证成功',
        codeInvalid: '激活码无效，请确保输入正确的激活码',
        codeFormatInvalid: '激活码格式不正确，请输入64位激活码',
        activationSuccess: '激活成功',
        activationFailed: '激活失败',
        savingActivationInfo: '保存激活信息...',
        activationInfoSaved: '激活信息已保存',
        failedToSaveActivationInfo: '无法保存激活信息',
        loadingActivationInfo: '加载激活信息...',
    },
    // 应用启动相关
    app: {
        starting: '应用启动中...',
        ready: '应用已就绪',
        closing: '应用关闭中...',
        closed: '应用已关闭',
    },
    // 模块加载相关
    module: {
        loading: '正在加载模块...',
        loaded: '模块加载成功',
        notFound: '模块未找到',
        loadFailed: '模块加载失败',
    },
    // 应用启动相关
    launcher: {
        starting: '应用启动中...',
        startSuccess: '应用启动成功',
        startFailed: '应用启动失败',
    },
    // 硬件信息相关
    hardware: {
        collecting: '正在收集硬件信息...',
        collected: '硬件信息已收集',
        collectionFailed: '硬件信息收集失败',
    },
};

/**
 * 错误代码映射
 * 用于标准化错误处理
 */
const errorCodes = {
    // 激活相关
    ACTIVATION_CODE_INVALID: 'E_ACTIVATION_CODE_INVALID',
    ACTIVATION_CODE_FORMAT_ERROR: 'E_ACTIVATION_CODE_FORMAT_ERROR',
    ACTIVATION_INFO_SAVE_FAILED: 'E_ACTIVATION_INFO_SAVE_FAILED',
    ACTIVATION_INFO_NOT_FOUND: 'E_ACTIVATION_INFO_NOT_FOUND',
    ACTIVATION_VERIFICATION_FAILED: 'E_ACTIVATION_VERIFICATION_FAILED',

    // 硬件相关
    HARDWARE_INFO_COLLECTION_FAILED: 'E_HARDWARE_INFO_COLLECTION_FAILED',
    MACHINE_CODE_GENERATION_FAILED: 'E_MACHINE_CODE_GENERATION_FAILED',

    // 应用启动相关
    APPLICATION_LAUNCH_FAILED: 'E_APPLICATION_LAUNCH_FAILED',
    APPLICATION_PATH_NOT_FOUND: 'E_APPLICATION_PATH_NOT_FOUND',

    // 模块加载相关
    MODULE_LOAD_FAILED: 'E_MODULE_LOAD_FAILED',
    MODULE_NOT_FOUND: 'E_MODULE_NOT_FOUND',
    MODULE_DATA_INVALID: 'E_MODULE_DATA_INVALID',
};

/**
 * 文件扩展名映射
 */
const fileExtensions = {
    executable: ['.exe', '.bat', '.cmd', '.com'],
    image: ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.bmp', '.webp'],
    config: ['.json', '.xml', '.yaml', '.yml', '.conf'],
};

/**
 * IPC 通道名称常量
 * 集中管理渲染进程和主进程间的通信通道
 */
const ipcChannels = {
    // 激活相关
    activate: 'activate',
    getMachineCode: 'get-machine-code',
    machineCodeResponse: 'machine-code-response',

    // 模块相关
    getModuleCategories: 'get-module-categories',
    moduleCategoriesResponse: 'module-categories-response',
    moduleCategoriesError: 'module-categories-error',

    // 应用启动相关
    launchApplication: 'launch-application',

    // 应用关闭
    closeApplication: 'close-application',

    // 产品名称相关
    getProductName: 'get-product-name',
    setProductName: 'set-product-name',
    getProductConfig: 'get-product-config',

    // Logo 相关
    uploadLogo: 'upload-logo',
    getLogosList: 'get-logos-list',
    deleteLogo: 'delete-logo',
    setDefaultLogo: 'set-default-logo',
    getLogo: 'get-logo',

    // 使用统计相关
    recordUsageStart: 'record-usage-start',
    recordUsageEnd: 'record-usage-end',
    getUsageStats: 'get-usage-stats',
    clearUsageStats: 'clear-usage-stats',

    // 权限管理相关
    verifyAdminPassword: 'verify-admin-password',
    checkPermission: 'check-permission',
    revokeSession: 'revoke-session',
    updateAdminPassword: 'update-admin-password',
};

/**
 * 应用图标映射表
 * 将应用ID映射到实际的图标文件名
 */
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

/**
 * 获取当前环境
 * @returns {string} 环境标识 'production' 或 'development'
 */
function getEnvironment() {
    return process.env.NODE_ENV || 'development';
}

/**
 * 获取相应环境下的日志级别
 * @returns {string} 日志级别
 */
function getLogLevel() {
    const env = getEnvironment();
    return env === 'production'
        ? loggingConfig.productionLevel
        : loggingConfig.developmentLevel;
}

module.exports = {
    appConfig,
    windowConfig,
    activationConfig,
    getActivationStoragePath,
    productNameConfig,
    getProductNameConfigPath,
    logoConfig,
    loggingConfig,
    logMessages,
    errorCodes,
    fileExtensions,
    ipcChannels,
    appIconMap,
    getEnvironment,
    getLogLevel,
};