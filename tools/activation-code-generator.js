/**
 * 激活码生成核心模块
 * 
 * 该模块提供生成激活码的核心逻辑
 * 与主应用使用相同的算法和密钥管理方式
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * 激活码生成器类
 */
class ActivationCodeGenerator {
    constructor() {
        this.secretKey = null;
        this.hashAlgorithm = 'sha256';
        this.activationCodeLength = 64;
    }

    /**
     * 初始化生成器，加载密钥
     * 按优先级加载密钥：系统环境变量 > .env 文件 > 手动提供
     * 
     * @param {Object} options - 配置选项
     * @param {string} options.secretKey - 手动提供的密钥（可选）
     * @param {string} options.envPath - .env 文件路径（可选）
     * @returns {boolean} 是否初始化成功
     */
    initialize(options = {}) {
        try {
            // 优先级1：尝试从嵌入式密钥配置加载（生产环境）
            try {
                const embeddedSecretsPath = path.join(__dirname, '..', 'embedded-secrets.js');
                if (fs.existsSync(embeddedSecretsPath)) {
                    const embeddedSecrets = require(embeddedSecretsPath);
                    if (embeddedSecrets.activationSecretKey) {
                        this.secretKey = embeddedSecrets.activationSecretKey;
                        console.log('✓ 密钥已从应用嵌入式配置加载（与打包应用一致）');
                        return true;
                    }
                }
            } catch (error) {
                console.warn('⚠ 无法加载嵌入式密钥配置:', error.message);
            }

            // 优先级2：系统环境变量
            if (process.env.ACTIVATION_SECRET_KEY) {
                this.secretKey = process.env.ACTIVATION_SECRET_KEY;
                console.log('✓ 密钥已从系统环境变量加载');
                return true;
            }

            // 优先级3：从 .env 文件加载
            const envPath = options.envPath || path.join(__dirname, '..', '.env');
            if (fs.existsSync(envPath)) {
                const secretKey = this._loadSecretKeyFromEnv(envPath);
                if (secretKey) {
                    this.secretKey = secretKey;
                    console.log('✓ 密钥已从 .env 文件加载');
                    return true;
                }
            }

            // 优先级4：使用手动提供的密钥
            if (options.secretKey) {
                if (options.secretKey.length < 32) {
                    throw new Error('密钥长度必须至少为 32 个字符');
                }
                this.secretKey = options.secretKey;
                console.log('✓ 密钥已使用提供的值');
                return true;
            }

            throw new Error('未能加载密钥。请确保：\n  1. 应用中存在 embedded-secrets.js（生产构建）\n  2. 或设置 ACTIVATION_SECRET_KEY 环境变量\n  3. 或在项目根目录提供 .env 文件\n  4. 或直接传递密钥参数');
        } catch (error) {
            console.error('× 初始化失败:', error.message);
            return false;
        }
    }

    /**
     * 从 .env 文件中加载密钥
     * @private
     */
    _loadSecretKeyFromEnv(envPath) {
        try {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const lines = envContent.split('\n');

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const [key, value] = trimmed.split('=');
                    if (key && key.trim() === 'ACTIVATION_SECRET_KEY') {
                        return value.trim();
                    }
                }
            }
        } catch (error) {
            console.warn('无法从 .env 文件读取密钥:', error.message);
        }
        return null;
    }

    /**
     * 验证密钥是否已加载
     * @returns {boolean}
     */
    isInitialized() {
        return this.secretKey !== null && this.secretKey.length >= 32;
    }

    /**
     * 生成单个激活码
     * 
     * 使用 HMAC-SHA256 算法基于机器码和密钥生成激活码
     * 生成公式与主应用保持一致
     * 
     * @param {string} machineCode - 用户的机器码（SHA256 hash）
     * @returns {Object} { success: boolean, activationCode?: string, error?: string }
     */
    generateActivationCode(machineCode) {
        try {
            if (!this.isInitialized()) {
                return {
                    success: false,
                    error: '激活码生成器未初始化。请先初始化并加载密钥'
                };
            }

            if (!machineCode || typeof machineCode !== 'string') {
                return {
                    success: false,
                    error: '机器码必须是有效的字符串'
                };
            }

            if (machineCode.length !== 64) {
                return {
                    success: false,
                    error: `机器码长度错误。预期 64 个十六进制字符，实际 ${machineCode.length} 个`
                };
            }

            // 验证机器码是否为有效的十六进制字符串
            if (!/^[a-fA-F0-9]{64}$/.test(machineCode)) {
                return {
                    success: false,
                    error: '机器码必须是有效的十六进制字符串'
                };
            }

            // 生成激活码：使用 HMAC-SHA256
            const hmac = crypto.createHmac(this.hashAlgorithm, this.secretKey);
            hmac.update(machineCode);
            const activationCode = hmac.digest('hex');

            // 验证激活码长度（应为 64 位）
            if (activationCode.length !== this.activationCodeLength) {
                return {
                    success: false,
                    error: `激活码长度错误。预期 ${this.activationCodeLength} 位，实际 ${activationCode.length} 位`
                };
            }

            return {
                success: true,
                activationCode: activationCode
            };
        } catch (error) {
            return {
                success: false,
                error: `生成激活码时出错: ${error.message}`
            };
        }
    }

    /**
     * 批量生成激活码
     * 
     * @param {Array<string>} machineCodes - 机器码数组
     * @returns {Object} { success: boolean, results: Array, failureCount: number }
     */
    generateMultipleCodes(machineCodes) {
        try {
            if (!Array.isArray(machineCodes)) {
                return {
                    success: false,
                    error: '输入必须是机器码数组'
                };
            }

            const results = [];
            let successCount = 0;
            let failureCount = 0;

            for (let i = 0; i < machineCodes.length; i++) {
                const machineCode = machineCodes[i];
                const result = this.generateActivationCode(machineCode);

                if (result.success) {
                    results.push({
                        index: i + 1,
                        machineCode: machineCode,
                        activationCode: result.activationCode,
                        status: 'success'
                    });
                    successCount++;
                } else {
                    results.push({
                        index: i + 1,
                        machineCode: machineCode,
                        error: result.error,
                        status: 'failed'
                    });
                    failureCount++;
                }
            }

            return {
                success: failureCount === 0,
                total: machineCodes.length,
                successCount: successCount,
                failureCount: failureCount,
                results: results
            };
        } catch (error) {
            return {
                success: false,
                error: `批量生成激活码时出错: ${error.message}`
            };
        }
    }

    /**
     * 从 CSV 文件读取机器码并生成激活码
     * 
     * CSV 格式期望为单列或多列，第一列为机器码
     * 示例：
     * a1b2c3d4e5f6...
     * f6e5d4c3b2a1...
     * 
     * @param {string} csvPath - CSV 文件路径
     * @param {Object} options - 选项
     * @param {boolean} options.hasHeader - 是否有表头行
     * @returns {Object} { success: boolean, results?: Array, error?: string }
     */
    generateFromCSV(csvPath, options = {}) {
        try {
            const hasHeader = options.hasHeader || false;

            if (!fs.existsSync(csvPath)) {
                return {
                    success: false,
                    error: `文件不存在: ${csvPath}`
                };
            }

            const fileContent = fs.readFileSync(csvPath, 'utf8');
            const lines = fileContent.split('\n').filter(line => line.trim());

            let startIndex = 0;
            if (hasHeader && lines.length > 0) {
                startIndex = 1;
            }

            const machineCodes = lines
                .slice(startIndex)
                .map((line, index) => {
                    // 取第一列（用逗号或制表符分隔）
                    const columns = line.split(/[,\t]/);
                    return columns[0].trim();
                })
                .filter(code => code.length > 0);

            if (machineCodes.length === 0) {
                return {
                    success: false,
                    error: '文件中没有有效的机器码'
                };
            }

            return this.generateMultipleCodes(machineCodes);
        } catch (error) {
            return {
                success: false,
                error: `从 CSV 文件读取机器码时出错: ${error.message}`
            };
        }
    }

    /**
     * 将激活码结果保存到 CSV 文件
     * 
     * @param {Array} results - 生成结果数组
     * @param {string} outputPath - 输出文件路径
     * @returns {Object} { success: boolean, path?: string, error?: string }
     */
    saveToCSV(results, outputPath) {
        try {
            if (!Array.isArray(results)) {
                return {
                    success: false,
                    error: '输入必须是结果数组'
                };
            }

            let csvContent = '序号,机器码,激活码,状态,错误信息\n';

            for (const result of results) {
                const index = result.index || '';
                const machineCode = result.machineCode || '';
                const activationCode = result.activationCode || '';
                const status = result.status || '';
                const error = result.error ? `"${result.error}"` : '';

                csvContent += `${index},"${machineCode}","${activationCode}",${status},${error}\n`;
            }

            fs.writeFileSync(outputPath, csvContent, 'utf8');

            return {
                success: true,
                path: outputPath,
                message: `结果已保存到 ${outputPath}`
            };
        } catch (error) {
            return {
                success: false,
                error: `保存到 CSV 文件时出错: ${error.message}`
            };
        }
    }

    /**
     * 验证激活码是否正确
     * 
     * 与主应用使用相同的验证逻辑
     * 
     * @param {string} machineCode - 机器码
     * @param {string} activationCode - 激活码
     * @returns {boolean} 是否匹配
     */
    verifyActivationCode(machineCode, activationCode) {
        try {
            const result = this.generateActivationCode(machineCode);
            if (!result.success) {
                return false;
            }
            return result.activationCode === activationCode;
        } catch (error) {
            return false;
        }
    }

    /**
     * 获取生成器状态信息
     * @returns {Object} 状态信息
     */
    getStatus() {
        return {
            initialized: this.isInitialized(),
            hashAlgorithm: this.hashAlgorithm,
            activationCodeLength: this.activationCodeLength,
            secretKeyLength: this.secretKey ? this.secretKey.length : 0,
            hasSecretKey: !!this.secretKey
        };
    }
}

module.exports = ActivationCodeGenerator;
