/**
 * 激活码生成工具 - Express 服务器
 * 
 * 为 GUI 和 API 调用提供后端支持
 * 
 * 使用方法：
 * node activation-tool-server.js [--port 3000]
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ActivationCodeGenerator = require('./activation-code-generator');

class ActivationToolServer {
    constructor(port = 3000) {
        this.port = port;
        this.app = express();
        this.generator = new ActivationCodeGenerator();
        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * 配置中间件
     */
    setupMiddleware() {
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ limit: '10mb', extended: true }));
        this.app.use(multer().single('file'));

        // 提供静态文件
        const guiPath = path.join(__dirname, 'activation-tool-gui.html');
        this.app.get('/', (req, res) => {
            if (fs.existsSync(guiPath)) {
                res.sendFile(guiPath);
            } else {
                res.status(404).send('GUI 文件未找到');
            }
        });
    }

    /**
     * 配置路由
     */
    setupRoutes() {
        // 初始化检查
        this.app.post('/api/init', (req, res) => {
            const { secretKey } = req.body;
            const options = secretKey ? { secretKey } : {};

            if (this.generator.initialize(options)) {
                res.json({ success: true });
            } else {
                res.json({ success: false, error: '初始化失败' });
            }
        });

        // 生成单个激活码
        this.app.post('/api/generate', (req, res) => {
            const { machineCode } = req.body;

            if (!machineCode) {
                return res.json({ success: false, error: '机器码不能为空' });
            }

            const result = this.generator.generateActivationCode(machineCode);
            res.json(result);
        });

        // 批量生成激活码
        this.app.post('/api/batch-generate', (req, res) => {
            try {
                const file = req.file;
                const hasHeader = req.body.hasHeader === 'true';

                if (!file) {
                    return res.json({ success: false, error: '请提供 CSV 文件' });
                }

                const fileContent = file.buffer.toString('utf8');
                const lines = fileContent.split('\n').filter(line => line.trim());

                let startIndex = 0;
                if (hasHeader && lines.length > 0) {
                    startIndex = 1;
                }

                const machineCodes = lines
                    .slice(startIndex)
                    .map(line => {
                        const columns = line.split(/[,\t]/);
                        return columns[0].trim();
                    })
                    .filter(code => code.length > 0);

                if (machineCodes.length === 0) {
                    return res.json({ success: false, error: '文件中没有有效的机器码' });
                }

                const result = this.generator.generateMultipleCodes(machineCodes);
                res.json(result);
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });

        // 验证激活码
        this.app.post('/api/verify', (req, res) => {
            const { machineCode, activationCode } = req.body;

            if (!machineCode || !activationCode) {
                return res.json({ valid: false, error: '机器码和激活码都是必需的' });
            }

            const valid = this.generator.verifyActivationCode(machineCode, activationCode);
            res.json({ valid });
        });

        // 获取生成器状态
        this.app.get('/api/status', (req, res) => {
            const status = this.generator.getStatus();
            res.json(status);
        });

        // 错误处理
        this.app.use((err, req, res, next) => {
            console.error(err);
            res.json({ success: false, error: err.message });
        });
    }

    /**
     * 启动服务器
     */
    start() {
        // 初始化生成器
        if (!this.generator.initialize()) {
            console.error('× 生成器初始化失败');
            process.exit(1);
        }

        this.app.listen(this.port, () => {
            console.log(`
╔════════════════════════════════════════════════════════════════════╗
║         激活码生成工具 - Web 服务器已启动                          ║
║         Activation Code Generator - Web Server Started              ║
╚════════════════════════════════════════════════════════════════════╝

📍 服务器地址: http://localhost:${this.port}

在浏览器中打开: http://localhost:${this.port}

按 Ctrl+C 停止服务器...
            `);
        });
    }
}

// 启动服务器
if (require.main === module) {
    const args = process.argv.slice(2);
    let port = 3000;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--port' && args[i + 1]) {
            port = parseInt(args[i + 1], 10);
        }
    }

    const server = new ActivationToolServer(port);
    server.start();
}

module.exports = ActivationToolServer;
