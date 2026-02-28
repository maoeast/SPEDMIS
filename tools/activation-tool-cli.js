#!/usr/bin/env node

/**
 * 激活码生成工具 - 命令行版本
 * 
 * 使用方法：
 * node activation-tool-cli.js --machine-code <机器码>
 * node activation-tool-cli.js --help
 * node activation-tool-cli.js --interactive
 * node activation-tool-cli.js --csv <输入文件> --output <输出文件>
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const ActivationCodeGenerator = require('./activation-code-generator');

class ActivationToolCLI {
    constructor() {
        this.generator = new ActivationCodeGenerator();
        this.rl = null;
    }

    /**
     * 显示帮助信息
     */
    showHelp() {
        console.log(`
╔════════════════════════════════════════════════════════════════════╗
║              激活码生成工具 - 命令行版本                           ║
║          Activation Code Generator - Command Line Version           ║
╚════════════════════════════════════════════════════════════════════╝

用法 (Usage):
  node activation-tool-cli.js [选项]

选项 (Options):
  --help                    显示此帮助信息
  --version                 显示版本信息
  
  --interactive             进入交互模式（推荐）
  --machine-code <code>     为单个机器码生成激活码
  --csv <file>              从 CSV 文件批量生成激活码
  --output <file>           指定输出文件路径（与 --csv 配合使用）
  
  --secret-key <key>        指定激活系统密钥（如未设置环境变量）
  --verify <code>           验证激活码是否正确

示例 (Examples):

1. 交互模式（推荐使用）:
   node activation-tool-cli.js --interactive

2. 生成单个激活码:
   node activation-tool-cli.js --machine-code abc123def456...

3. 从 CSV 文件批量生成:
   node activation-tool-cli.js --csv input.csv --output output.csv

4. 验证激活码:
   node activation-tool-cli.js --verify abc123def456... --machine-code xyz789...

环境变量 (Environment Variables):
  ACTIVATION_SECRET_KEY     激活系统密钥（可选，如未提供则使用 .env 文件或手动输入）

文件格式 (File Format):

CSV 输入文件示例 (input.csv):
  机器码
  a1b2c3d4e5f6...
  f6e5d4c3b2a1...

CSV 输出文件示例 (output.csv):
  序号,机器码,激活码,状态,错误信息
  1,"a1b2c3d4e5f6...",激活码值,success,
  2,"f6e5d4c3b2a1...",激活码值,success,
        `);
    }

    /**
     * 显示版本信息
     */
    showVersion() {
        console.log('激活码生成工具 v1.0.0');
    }

    /**
     * 解析命令行参数
     */
    parseArguments(argv) {
        const args = {};
        for (let i = 2; i < argv.length; i++) {
            const arg = argv[i];
            if (arg.startsWith('--')) {
                const key = arg.substring(2);
                const nextArg = argv[i + 1];
                if (nextArg && !nextArg.startsWith('--')) {
                    args[key] = nextArg;
                    i++;
                } else {
                    args[key] = true;
                }
            }
        }
        return args;
    }

    /**
     * 运行主程序
     */
    async run(argv = process.argv) {
        try {
            const args = this.parseArguments(argv);

            // 处理帮助
            if (args.help) {
                this.showHelp();
                return;
            }

            // 处理版本
            if (args.version) {
                this.showVersion();
                return;
            }

            // 初始化生成器
            const initOptions = {};
            if (args['secret-key']) {
                initOptions.secretKey = args['secret-key'];
            }

            if (!this.generator.initialize(initOptions)) {
                console.error('✗ 初始化失败。请检查密钥配置。\n');
                console.log('密钥获取方式：');
                console.log('1. 设置系统环境变量 ACTIVATION_SECRET_KEY');
                console.log('2. 在项目根目录创建 .env 文件并添加 ACTIVATION_SECRET_KEY=...');
                console.log('3. 使用 --secret-key 参数直接传递密钥\n');
                process.exit(1);
            }

            // 处理交互模式
            if (args.interactive) {
                await this.interactiveMode();
                return;
            }

            // 处理单个机器码
            if (args['machine-code']) {
                this.generateSingle(args['machine-code']);
                return;
            }

            // 处理 CSV 文件
            if (args.csv) {
                this.generateFromCSV(args.csv, args.output);
                return;
            }

            // 处理验证
            if (args.verify && args['machine-code']) {
                this.verify(args['machine-code'], args.verify);
                return;
            }

            // 如果没有参数，显示帮助或进入交互模式
            if (Object.keys(args).length === 0) {
                console.log('未提供参数。进入交互模式...\n');
                await this.interactiveMode();
            }
        } catch (error) {
            console.error('× 发生错误:', error.message);
            process.exit(1);
        }
    }

    /**
     * 交互模式
     */
    async interactiveMode() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('\n╔════════════════════════════════════════════════════════════════════╗');
        console.log('║                      激活码生成工具 - 交互模式                     ║');
        console.log('╚════════════════════════════════════════════════════════════════════╝\n');

        await this.showMainMenu();

        this.rl.close();
    }

    /**
     * 主菜单
     */
    async showMainMenu() {
        console.log('请选择操作:');
        console.log('  1. 生成单个激活码');
        console.log('  2. 从 CSV 文件批量生成');
        console.log('  3. 验证激活码');
        console.log('  4. 查看生成器状态');
        console.log('  5. 退出\n');

        const choice = await this.question('请输入选项 (1-5): ');

        switch (choice.trim()) {
            case '1':
                await this.interactiveSingleGeneration();
                break;
            case '2':
                await this.interactiveCSVGeneration();
                break;
            case '3':
                await this.interactiveVerification();
                break;
            case '4':
                this.showStatus();
                break;
            case '5':
                console.log('✓ 再见!\n');
                return;
            default:
                console.log('✗ 无效选项\n');
                await this.showMainMenu();
        }

        console.log('');
        await this.showMainMenu();
    }

    /**
     * 交互式单个生成
     */
    async interactiveSingleGeneration() {
        console.log('\n--- 生成单个激活码 ---\n');
        const machineCode = await this.question('请输入机器码: ');

        if (!machineCode.trim()) {
            console.log('✗ 机器码不能为空\n');
            return;
        }

        this.generateSingle(machineCode.trim());
    }

    /**
     * 生成单个激活码
     */
    generateSingle(machineCode) {
        console.log(`\n生成中...\n`);
        const result = this.generator.generateActivationCode(machineCode);

        if (result.success) {
            console.log('✓ 激活码生成成功！\n');
            console.log(`  机器码:    ${machineCode}`);
            console.log(`  激活码:    ${result.activationCode}\n`);

            // 提供复制建议
            console.log('复制激活码到剪贴板或保存以供分发给用户。\n');
        } else {
            console.log('✗ 生成失败！\n');
            console.log(`  错误: ${result.error}\n`);
        }
    }

    /**
     * 交互式 CSV 生成
     */
    async interactiveCSVGeneration() {
        console.log('\n--- 从 CSV 文件批量生成 ---\n');
        const inputFile = await this.question('请输入 CSV 文件路径: ');
        const hasHeader = await this.question('文件是否包含表头 (y/n): ');

        if (!fs.existsSync(inputFile.trim())) {
            console.log(`✗ 文件不存在: ${inputFile}\n`);
            return;
        }

        let outputFile = await this.question('输出文件路径 (默认: output.csv): ');
        outputFile = outputFile.trim() || 'output.csv';

        this.generateFromCSV(inputFile.trim(), outputFile, hasHeader.toLowerCase() === 'y');
    }

    /**
     * 从 CSV 文件生成
     */
    generateFromCSV(inputFile, outputFile, hasHeader = false) {
        console.log('\n处理中...\n');

        const result = this.generator.generateFromCSV(inputFile, { hasHeader });

        if (result.success) {
            const saveResult = this.generator.saveToCSV(result.results, outputFile);

            if (saveResult.success) {
                console.log('✓ 批量生成成功！\n');
                console.log(`  输入文件:    ${inputFile}`);
                console.log(`  输出文件:    ${saveResult.path}`);
                console.log(`  总数:        ${result.total}`);
                console.log(`  成功:        ${result.successCount}`);
                console.log(`  失败:        ${result.failureCount}\n`);
            } else {
                console.log('✗ 保存结果失败！\n');
                console.log(`  错误: ${saveResult.error}\n`);
            }
        } else {
            console.log('✗ 生成失败！\n');
            console.log(`  错误: ${result.error}\n`);
        }
    }

    /**
     * 交互式验证
     */
    async interactiveVerification() {
        console.log('\n--- 验证激活码 ---\n');
        const machineCode = await this.question('请输入机器码: ');
        const activationCode = await this.question('请输入激活码: ');

        if (!machineCode.trim() || !activationCode.trim()) {
            console.log('✗ 机器码和激活码都是必需的\n');
            return;
        }

        this.verify(machineCode.trim(), activationCode.trim());
    }

    /**
     * 验证激活码
     */
    verify(machineCode, activationCode) {
        console.log('\n验证中...\n');

        const isValid = this.generator.verifyActivationCode(machineCode, activationCode);

        if (isValid) {
            console.log('✓ 激活码有效！\n');
            console.log(`  机器码:    ${machineCode}`);
            console.log(`  激活码:    ${activationCode}`);
            console.log(`  验证:      成功\n`);
        } else {
            console.log('✗ 激活码无效！\n');
            console.log(`  机器码:    ${machineCode}`);
            console.log(`  激活码:    ${activationCode}`);
            console.log(`  验证:      失败\n`);
            console.log('可能的原因:');
            console.log('  1. 激活码与机器码不匹配');
            console.log('  2. 机器码格式错误');
            console.log('  3. 使用的密钥与生成激活码时的密钥不同\n');
        }
    }

    /**
     * 显示状态信息
     */
    showStatus() {
        const status = this.generator.getStatus();

        console.log('\n--- 生成器状态 ---\n');
        console.log(`  已初始化:       ${status.initialized ? '是' : '否'}`);
        console.log(`  哈希算法:       ${status.hashAlgorithm}`);
        console.log(`  激活码长度:     ${status.activationCodeLength} 位`);
        console.log(`  密钥长度:       ${status.secretKeyLength} 字符`);
        console.log(`  已加载密钥:     ${status.hasSecretKey ? '是' : '否'}\n`);
    }

    /**
     * 向用户提问
     */
    question(prompt) {
        return new Promise((resolve) => {
            this.rl.question(prompt, (answer) => {
                resolve(answer);
            });
        });
    }
}

// 运行工具
if (require.main === module) {
    const tool = new ActivationToolCLI();
    tool.run().catch(error => {
        console.error('× 致命错误:', error);
        process.exit(1);
    });
}

module.exports = ActivationToolCLI;
