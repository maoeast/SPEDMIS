/**
 * 激活码生成工具 - 测试脚本
 * 
 * 验证激活码生成逻辑与主应用的一致性
 * 
 * 运行方式：
 * node test-activation-generator.js
 */

const crypto = require('crypto');
const ActivationCodeGenerator = require('./activation-code-generator');

class TestRunner {
    constructor() {
        this.testCount = 0;
        this.passCount = 0;
        this.failCount = 0;
        this.generator = new ActivationCodeGenerator();
    }

    /**
     * 运行所有测试
     */
    run() {
        console.log(`
╔════════════════════════════════════════════════════════════════════╗
║         激活码生成工具 - 功能测试                                  ║
║         Activation Code Generator - Test Suite                     ║
╚════════════════════════════════════════════════════════════════════╝
        `);

        // 初始化生成器
        if (!this.generator.initialize()) {
            console.error('✗ 生成器初始化失败');
            process.exit(1);
        }

        console.log('✓ 生成器初始化成功\n');

        // 运行所有测试
        this.testInitialization();
        this.testSingleGeneration();
        this.testActivationCodeFormat();
        this.testMultipleGeneration();
        this.testVerification();
        this.testMachineCodeValidation();
        this.testConsistency();

        // 显示测试结果
        this.showResults();
    }

    /**
     * 测试初始化
     */
    testInitialization() {
        console.log('📋 测试 1: 初始化');
        this.test('应正确初始化生成器', () => {
            return this.generator.isInitialized();
        });

        this.test('应获取正确的状态信息', () => {
            const status = this.generator.getStatus();
            return status.initialized && status.hasSecretKey;
        });

        console.log('');
    }

    /**
     * 测试单个激活码生成
     */
    testSingleGeneration() {
        console.log('📋 测试 2: 单个激活码生成');

        const testMachineCode = 'a'.repeat(64);

        this.test('应成功生成激活码', () => {
            const result = this.generator.generateActivationCode(testMachineCode);
            return result.success && result.activationCode;
        });

        this.test('生成的激活码应为 64 位十六进制', () => {
            const result = this.generator.generateActivationCode(testMachineCode);
            return result.success &&
                result.activationCode.length === 64 &&
                /^[a-fA-F0-9]{64}$/.test(result.activationCode);
        });

        console.log('');
    }

    /**
     * 测试激活码格式
     */
    testActivationCodeFormat() {
        console.log('📋 测试 3: 激活码格式验证');

        const validMachineCode = 'b'.repeat(64);
        const result = this.generator.generateActivationCode(validMachineCode);

        this.test('激活码应由小写十六进制字符组成', () => {
            return /^[a-f0-9]{64}$/.test(result.activationCode);
        });

        this.test('激活码长度应为 64 位', () => {
            return result.activationCode.length === 64;
        });

        console.log('');
    }

    /**
     * 测试批量生成
     */
    testMultipleGeneration() {
        console.log('📋 测试 4: 批量激活码生成');

        const machineCodes = [
            'c'.repeat(64),
            'd'.repeat(64),
            'e'.repeat(64)
        ];

        this.test('应成功批量生成激活码', () => {
            const result = this.generator.generateMultipleCodes(machineCodes);
            return result.success &&
                result.successCount === 3 &&
                result.failureCount === 0;
        });

        this.test('应正确处理无效的机器码', () => {
            const invalidCodes = [
                'c'.repeat(64),      // 有效
                'invalid',           // 无效：长度错误
                'd'.repeat(64)       // 有效
            ];
            const result = this.generator.generateMultipleCodes(invalidCodes);
            return result.successCount === 2 && result.failureCount === 1;
        });

        console.log('');
    }

    /**
     * 测试激活码验证
     */
    testVerification() {
        console.log('📋 测试 5: 激活码验证');

        const testMachineCode = 'f'.repeat(64);
        const genResult = this.generator.generateActivationCode(testMachineCode);

        this.test('应正确验证有效的激活码', () => {
            return this.generator.verifyActivationCode(testMachineCode, genResult.activationCode);
        });

        this.test('应拒绝无效的激活码', () => {
            const invalidCode = 'a'.repeat(64);
            return !this.generator.verifyActivationCode(testMachineCode, invalidCode);
        });

        this.test('应拒绝机器码不匹配的激活码', () => {
            const otherMachineCode = '0'.repeat(64);
            return !this.generator.verifyActivationCode(otherMachineCode, genResult.activationCode);
        });

        console.log('');
    }

    /**
     * 测试机器码验证
     */
    testMachineCodeValidation() {
        console.log('📋 测试 6: 机器码验证');

        this.test('应拒绝长度错误的机器码', () => {
            const result = this.generator.generateActivationCode('short');
            return !result.success && result.error;
        });

        this.test('应拒绝非十六进制的机器码', () => {
            const result = this.generator.generateActivationCode('g'.repeat(64));
            return !result.success && result.error;
        });

        this.test('应拒绝空机器码', () => {
            const result = this.generator.generateActivationCode('');
            return !result.success;
        });

        console.log('');
    }

    /**
     * 测试与主应用的一致性
     */
    testConsistency() {
        console.log('📋 测试 7: 与主应用算法的一致性');

        const testMachineCode = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        const secretKey = this.generator.secretKey;

        this.test('应使用 HMAC-SHA256 算法', () => {
            const result = this.generator.generateActivationCode(testMachineCode);

            // 手动验证算法
            const hmac = crypto.createHmac('sha256', secretKey);
            hmac.update(testMachineCode);
            const expectedCode = hmac.digest('hex');

            return result.success && result.activationCode === expectedCode;
        });

        this.test('生成的激活码应能被验证', () => {
            const result = this.generator.generateActivationCode(testMachineCode);
            const verified = this.generator.verifyActivationCode(
                testMachineCode,
                result.activationCode
            );
            return verified;
        });

        this.test('同一机器码应生成相同的激活码', () => {
            const result1 = this.generator.generateActivationCode(testMachineCode);
            const result2 = this.generator.generateActivationCode(testMachineCode);
            return result1.activationCode === result2.activationCode;
        });

        console.log('');
    }

    /**
     * 执行单个测试
     */
    test(description, testFn) {
        this.testCount++;
        try {
            const result = testFn();
            if (result) {
                console.log(`  ✓ ${description}`);
                this.passCount++;
            } else {
                console.log(`  ✗ ${description}`);
                this.failCount++;
            }
        } catch (error) {
            console.log(`  ✗ ${description} - ${error.message}`);
            this.failCount++;
        }
    }

    /**
     * 显示测试结果
     */
    showResults() {
        const passRate = ((this.passCount / this.testCount) * 100).toFixed(1);

        console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                      测试结果                                      ║
╚════════════════════════════════════════════════════════════════════╝

总计:       ${this.testCount} 个测试
✓ 通过:     ${this.passCount} 个
✗ 失败:     ${this.failCount} 个
成功率:     ${passRate}%

        `);

        if (this.failCount === 0) {
            console.log('🎉 所有测试通过！激活码生成工具已准备好使用。\n');
            process.exit(0);
        } else {
            console.log(`❌ 有 ${this.failCount} 个测试失败。请检查配置。\n`);
            process.exit(1);
        }
    }
}

// 运行测试
if (require.main === module) {
    const runner = new TestRunner();
    runner.run();
}

module.exports = TestRunner;
