#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'embedded-secrets.js');
const REFERENCE_KEY_PATH = path.join(PROJECT_ROOT, 'tools', '特殊教育多模态干预系统激活安全密钥.txt');

function loadEnvFile(envPath) {
    if (!fs.existsSync(envPath)) {
        return {};
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};

    envContent.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            return;
        }

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) {
            return;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();
        envVars[key] = value;
    });

    return envVars;
}

function getSecrets() {
    const envFileSecrets = loadEnvFile(ENV_PATH);

    return {
        activationSecretKey: process.env.ACTIVATION_SECRET_KEY || envFileSecrets.ACTIVATION_SECRET_KEY,
        encryptionKey: process.env.ACTIVATION_ENCRYPTION_KEY || envFileSecrets.ACTIVATION_ENCRYPTION_KEY,
        encryptionIV: process.env.ACTIVATION_ENCRYPTION_IV || envFileSecrets.ACTIVATION_ENCRYPTION_IV,
    };
}

function validateSecrets(secrets) {
    const errors = [];

    if (!secrets.activationSecretKey || secrets.activationSecretKey.length < 32) {
        errors.push('ACTIVATION_SECRET_KEY 必须存在且长度至少为 32 个字符');
    }

    if (!/^[a-fA-F0-9]{64}$/.test(secrets.encryptionKey || '')) {
        errors.push('ACTIVATION_ENCRYPTION_KEY 必须是 64 位十六进制字符串');
    }

    if (!/^[a-fA-F0-9]{32}$/.test(secrets.encryptionIV || '')) {
        errors.push('ACTIVATION_ENCRYPTION_IV 必须是 32 位十六进制字符串');
    }

    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }
}

function validateAgainstReferenceKey(secrets) {
    // 生产密钥文件是唯一可信来源；本机没有该文件时跳过（例如干净的构建机）。
    if (!fs.existsSync(REFERENCE_KEY_PATH)) {
        return;
    }

    const reference = fs.readFileSync(REFERENCE_KEY_PATH, 'utf8');
    const mismatches = [];

    if (!reference.includes(secrets.activationSecretKey)) {
        mismatches.push('ACTIVATION_SECRET_KEY');
    }
    if (!reference.includes(secrets.encryptionKey)) {
        mismatches.push('ACTIVATION_ENCRYPTION_KEY');
    }
    if (!reference.includes(secrets.encryptionIV)) {
        mismatches.push('ACTIVATION_ENCRYPTION_IV');
    }

    if (mismatches.length > 0) {
        throw new Error(
            `以下密钥与 tools/特殊教育多模态干预系统激活安全密钥.txt 不一致：${mismatches.join('、')}。` +
            '请检查环境变量或 .env；构建已中止，避免生成无法激活的安装包。'
        );
    }
}

function renderEmbeddedSecrets(secrets) {
    return `module.exports = {
    activationSecretKey: ${JSON.stringify(secrets.activationSecretKey)},
    encryptionKey: ${JSON.stringify(secrets.encryptionKey)},
    encryptionIV: ${JSON.stringify(secrets.encryptionIV)},
    generatedAt: ${JSON.stringify(new Date().toISOString())}
};
`;
}

function main() {
    const secrets = getSecrets();
    validateSecrets(secrets);
    validateAgainstReferenceKey(secrets);

    const output = renderEmbeddedSecrets(secrets);
    fs.writeFileSync(OUTPUT_PATH, output, 'utf8');

    console.log(`embedded secrets generated: ${OUTPUT_PATH}`);
}

try {
    main();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
