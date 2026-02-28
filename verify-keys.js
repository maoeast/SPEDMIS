/**
 * 密钥验证脚本
 * 用于验证应用和生成工具使用的密钥是否一致
 */

const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('密钥一致性验证');
console.log('='.repeat(60));
console.log();

// 1. 检查 embedded-secrets.js（打包应用的密钥）
console.log('1. 检查应用嵌入式密钥...');
const embeddedSecretsPath = path.join(__dirname, 'embedded-secrets.js');
let appSecretKey = null;

if (fs.existsSync(embeddedSecretsPath)) {
    try {
        delete require.cache[require.resolve(embeddedSecretsPath)];
        const embeddedSecrets = require(embeddedSecretsPath);
        appSecretKey = embeddedSecrets.activationSecretKey;
        console.log(`   ✓ 应用密钥长度: ${appSecretKey.length}`);
        console.log(`   ✓ 应用密钥前缀: ${appSecretKey.substring(0, 20)}...`);
    } catch (error) {
        console.log(`   ✗ 无法加载嵌入式密钥: ${error.message}`);
    }
} else {
    console.log('   ⚠ 未找到 embedded-secrets.js (可能未打包)');
}

console.log();

// 2. 检查系统环境变量密钥
console.log('2. 检查系统环境变量密钥...');
const envSecretKey = process.env.ACTIVATION_SECRET_KEY;

if (envSecretKey) {
    console.log(`   ✓ 环境变量密钥长度: ${envSecretKey.length}`);
    console.log(`   ✓ 环境变量密钥前缀: ${envSecretKey.substring(0, 20)}...`);
} else {
    console.log('   ⚠ 环境变量中未设置 ACTIVATION_SECRET_KEY');
}

console.log();

// 3. 检查 .env 文件密钥
console.log('3. 检查 .env 文件密钥...');
const envFilePath = path.join(__dirname, '.env');
let envFileSecretKey = null;

if (fs.existsSync(envFilePath)) {
    try {
        const envContent = fs.readFileSync(envFilePath, 'utf8');
        const lines = envContent.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('ACTIVATION_SECRET_KEY=')) {
                envFileSecretKey = trimmed.split('=')[1].trim();
                break;
            }
        }
        if (envFileSecretKey) {
            console.log(`   ✓ .env 文件密钥长度: ${envFileSecretKey.length}`);
            console.log(`   ✓ .env 文件密钥前缀: ${envFileSecretKey.substring(0, 20)}...`);
        } else {
            console.log('   ⚠ .env 文件中未设置 ACTIVATION_SECRET_KEY');
        }
    } catch (error) {
        console.log(`   ✗ 无法读取 .env 文件: ${error.message}`);
    }
} else {
    console.log('   ⚠ 未找到 .env 文件');
}

console.log();
console.log('='.repeat(60));
console.log('密钥一致性检查结果：');
console.log('='.repeat(60));

// 收集所有可用的密钥
const availableKeys = [];
if (appSecretKey) availableKeys.push({ source: '应用嵌入式', key: appSecretKey });
if (envSecretKey) availableKeys.push({ source: '系统环境变量', key: envSecretKey });
if (envFileSecretKey) availableKeys.push({ source: '.env 文件', key: envFileSecretKey });

if (availableKeys.length === 0) {
    console.log('\n❌ 错误：未找到任何密钥配置！');
    console.log('   请确保至少配置以下之一：');
    console.log('   - embedded-secrets.js（打包应用）');
    console.log('   - ACTIVATION_SECRET_KEY 环境变量');
    console.log('   - .env 文件');
    process.exit(1);
}

if (availableKeys.length === 1) {
    console.log(`\n✓ 只找到一个密钥源：${availableKeys[0].source}`);
    console.log('  这是正常的。');
} else {
    // 检查多个密钥是否一致
    const firstKey = availableKeys[0].key;
    const allSame = availableKeys.every(item => item.key === firstKey);

    console.log(`\n找到 ${availableKeys.length} 个密钥源：`);
    availableKeys.forEach(item => {
        console.log(`  - ${item.source}`);
    });

    console.log();
    if (allSame) {
        console.log('✓ 所有密钥一致！激活应该能正常工作。');
    } else {
        console.log('❌ 警告：密钥不一致！这会导致激活失败。');
        console.log();
        console.log('密钥对比：');
        availableKeys.forEach(item => {
            console.log(`  ${item.source}: ${item.key.substring(0, 30)}...`);
        });
        console.log();
        console.log('建议：');
        console.log('  1. 确保打包时使用的环境变量密钥');
        console.log('  2. 与生成激活码时使用的密钥相同');
        console.log('  3. 可以删除不需要的密钥源以避免混淆');
    }
}

console.log();
console.log('='.repeat(60));
