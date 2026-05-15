/**
 * Tauri API 调用模块
 * 提供前端调用 Tauri 后端命令的 JavaScript API
 */

// 检测是否在 Tauri 环境中
function isTauri() {
    return window.__TAURI__ !== undefined ||
           window.__TAURI_INTERNALS__ !== undefined ||
           window.location.protocol === 'tauri:' ||
           navigator.userAgent.includes('Tauri');
}

/**
 * 调用 Tauri 命令
 * @param {string} command - 命令名称
 * @param {object} args - 命令参数
 * @returns {Promise<any>}
 */
async function invoke(command, args = {}) {
    if (!isTauri()) {
        throw new Error('不在 Tauri 环境中');
    }

    if (!window.__TAURI__.core) {
        throw new Error('Tauri API 未初始化');
    }

    try {
        return await window.__TAURI__.core.invoke(command, args);
    } catch (error) {
        console.error(`[Tauri API] 调用 ${command} 失败:`, error);
        throw error;
    }
}

/**
 * 配置管理
 */
export const ConfigAPI = {
    /**
     * 读取应用配置
     * @returns {Promise<AppConfig>}
     */
    async read() {
        return await invoke('read_config');
    },

    /**
     * 写入应用配置
     * @param {AppConfig} config - 配置对象
     * @returns {Promise<void>}
     */
    async write(config) {
        return await invoke('write_config', { config });
    },

    /**
     * 获取应用数据目录
     * @returns {Promise<string>}
     */
    async getAppDir() {
        return await invoke('get_app_dir');
    }
};

/**
 * 文件对话框
 */
export const DialogAPI = {
    /**
     * 选择文件
     * @param {object} options - 选项
     * @param {string} options.title - 对话框标题
     * @param {Array} options.filters - 文件过滤器
     * @returns {Promise<string|null>} 选择的文件路径
     */
    async selectFile(options = {}) {
        const { title = '选择文件', filters = [] } = options;
        return await invoke('select_file_dialog', { title, filters });
    },

    /**
     * 选择保存位置
     * @param {object} options - 选项
     * @param {string} options.title - 对话框标题
     * @param {string} options.defaultName - 默认文件名
     * @param {Array} options.filters - 文件过滤器
     * @returns {Promise<string|null>} 保存的文件路径
     */
    async selectSave(options = {}) {
        const { title = '保存文件', defaultName = '', filters = [] } = options;
        return await invoke('select_save_dialog', { title, defaultName, filters });
    }
};

/**
 * 文件操作
 */
export const FileAPI = {
    /**
     * 检查文件是否存在
     * @param {string} path - 文件路径
     * @returns {Promise<boolean>}
     */
    async exists(path) {
        return await invoke('file_exists', { path });
    },

    /**
     * 读取文本文件
     * @param {string} path - 文件路径
     * @returns {Promise<string>}
     */
    async readText(path) {
        return await invoke('read_file', { path });
    },

    /**
     * 写入文本文件
     * @param {string} path - 文件路径
     * @param {string} content - 文件内容
     * @returns {Promise<void>}
     */
    async writeText(path, content) {
        return await invoke('write_file', { path, content });
    }
};

/**
 * 系统信息
 */
export const SystemAPI = {
    /**
     * 获取系统信息
     * @returns {Promise<{os: string, arch: string, family: string}>}
     */
    async getInfo() {
        return await invoke('get_system_info');
    },

    /**
     * 执行外部命令
     * @param {string} command - 命令
     * @param {string[]} args - 参数列表
     * @returns {Promise<string>} 命令输出
     */
    async execute(command, args = []) {
        return await invoke('execute_command', { command, args });
    }
};

/**
 * 快捷方式创建
 */
export const ShortcutAPI = {
    /**
     * 创建快捷方式
     * @param {object} options - 选项
     * @param {string} options.name - 快捷方式名称
     * @param {string} options.target - 目标路径或URL
     * @param {string} [options.iconPath] - 图标路径
     * @param {string} options.outputDir - 输出目录
     * @returns {Promise<string>} 创建的快捷方式路径
     */
    async create(options) {
        const { name, target, iconPath, outputDir } = options;
        return await invoke('create_shortcut', {
            name,
            target,
            iconPath,
            outputDir
        });
    }
};

/**
 * WebView 导航控制
 */
export const WebViewAPI = {
    /**
     * WebView 后退
     * @returns {Promise<void>}
     */
    async goBack() {
        return await invoke('webview_go_back');
    },

    /**
     * WebView 前进
     * @returns {Promise<void>}
     */
    async goForward() {
        return await invoke('webview_go_forward');
    },

    /**
     * WebView 刷新
     * @returns {Promise<void>}
     */
    async reload() {
        return await invoke('webview_reload');
    },

    /**
     * 在 WebView 中加载 URL
     * @param {string} url - 要加载的 URL
     * @returns {Promise<void>}
     */
    async loadUrl(url) {
        return await invoke('load_url_in_webview', { url });
    }
};

/**
 * 图像处理工具
 */
export const ImageUtils = {
    /**
     * 将文件转换为 Base64
     * @param {File} file - 文件对象
     * @returns {Promise<string>}
     */
    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
        });
    },

    /**
     * 压缩图像
     * @param {string} base64 - Base64 图像数据
     * @param {object} options - 选项
     * @param {number} options.maxWidth - 最大宽度
     * @param {number} options.maxHeight - 最大高度
     * @param {number} options.quality - 质量 (0-1)
     * @returns {Promise<string>}
     */
    async compress(base64, options = {}) {
        const { maxWidth = 1024, maxHeight = 1024, quality = 0.8 } = options;

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;

                // 计算缩放比例
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width *= ratio;
                    height *= ratio;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = base64;
        });
    }
};

/**
 * 导出所有 API
 */
export const TauriAPI = {
    isTauri,
    Config: ConfigAPI,
    Dialog: DialogAPI,
    File: FileAPI,
    System: SystemAPI,
    Shortcut: ShortcutAPI,
    WebView: WebViewAPI,
    Image: ImageUtils
};

// 默认导出
export default TauriAPI;

// 全局暴露（用于调试）
if (typeof window !== 'undefined') {
    window.TauriAPI = TauriAPI;
}
