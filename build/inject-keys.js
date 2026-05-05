#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'embedded-secrets.js');

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
