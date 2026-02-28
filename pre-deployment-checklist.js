#!/usr/bin/env node

/**
 * 生产环境部署前检查脚本
 * 
 * 用法：node pre-deployment-checklist.js
 * 
 * 此脚本验证应用是否为生产环境做好准备
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'blue');
    console.log('='.repeat(60));
}

function check(description, result, details = '') {
    const icon = result ? '✅' : '❌';
    console.log(`${icon} ${description}`);
    if (details) {
        console.log(`  ${details}`);
    }
    return result;
}

let passCount = 0;
let failCount = 0;

function recordResult(result) {
    if (result) {
        passCount++;
    } else {
        failCount++;
    }
}

// ========== 检查开始 ==========

section('1. 环境配置检查');

// 检查Node版本
try {
    const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
    const versionMatch = nodeVersion.match(/v(\d+)/);
    const majorVersion = parseInt(versionMatch[1]);
    const result = majorVersion >= 16;
    recordResult(check(`Node.js 版本 >= 16`, result, `当前版本: ${nodeVersion}`));
} catch (error) {
    recordResult(check(`Node.js 版本 >= 16`, false, '无法检测Node.js'));
}

// 检查npm版本
try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    const versionMatch = npmVersion.match(/(\d+)/);
    const majorVersion = parseInt(versionMatch[1]);
    const result = majorVersion >= 8;
    recordResult(check(`npm 版本 >= 8`, result, `当前版本: ${npmVersion}`));
} catch (error) {
    recordResult(check(`npm 版本 >= 8`, false, '无法检测npm'));
}

section('2. 依赖安装检查');

// 检查node_modules
const nodeModulesExists = fs.existsSync(path.join(__dirname, 'node_modules'));
recordResult(check('node_modules 已安装', nodeModulesExists));

// 检查必要的依赖
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const requiredDeps = ['electron', 'sql.js'];
requiredDeps.forEach(dep => {
    const result = packageJson.dependencies && (packageJson.dependencies[dep] || packageJson.devDependencies[dep]);
    recordResult(check(`依赖 ${dep} 已声明`, !!result));
});

section('3. 安全配置检查');

// 检查 .gitignore 中是否有 .env
const gitignorePath = path.join(__dirname, '.gitignore');
let envInGitignore = false;
if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    envInGitignore = gitignoreContent.includes('.env');
}
recordResult(check('.env 已添加到 .gitignore', envInGitignore || !fs.existsSync('.env')));

// 检查是否有硬编码的密钥在源代码中
const configPath = path.join(__dirname, 'config.js');
let noHardcodedSecret = true;
if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf8');
    // 检查是否有SpecialEducationMultiModalInterventionSystem2023这个硬编码值
    if (configContent.includes('SpecialEducationMultiModalInterventionSystem2023')) {
        noHardcodedSecret = false;
    }
}
recordResult(check('config.js 中无硬编码 SECRET_KEY', noHardcodedSecret));

// 检查环境变量设置
const hasSecretKey = process.env.ACTIVATION_SECRET_KEY !== undefined;
const hasEncryptionKey = process.env.ACTIVATION_ENCRYPTION_KEY !== undefined;
const hasEncryptionIV = process.env.ACTIVATION_ENCRYPTION_IV !== undefined;

if (process.env.NODE_ENV === 'production') {
    recordResult(check('ACTIVATION_SECRET_KEY 环境变量已设置', hasSecretKey));
    recordResult(check('ACTIVATION_ENCRYPTION_KEY 环境变量已设置', hasEncryptionKey));
    recordResult(check('ACTIVATION_ENCRYPTION_IV 环境变量已设置', hasEncryptionIV));
    recordResult(check('NODE_ENV=production', process.env.NODE_ENV === 'production'));
} else {
    log('⚠️  当前环境为非生产环境（NODE_ENV未设置为production）', 'yellow');
}

section('4. 密钥强度检查');

if (hasSecretKey) {
    const secretKeyLength = (process.env.ACTIVATION_SECRET_KEY || '').length;
    recordResult(check('SECRET_KEY 长度 >= 32 字符', secretKeyLength >= 32, `当前长度: ${secretKeyLength}`));
}

if (hasEncryptionKey) {
    const keyLength = (process.env.ACTIVATION_ENCRYPTION_KEY || '').length;
    // 32字节 = 64个十六进制字符
    recordResult(check('ENCRYPTION_KEY 为 32 字节（64个十六进制字符）', keyLength === 64, `当前长度: ${keyLength} 字符`));
}

if (hasEncryptionIV) {
    const ivLength = (process.env.ACTIVATION_ENCRYPTION_IV || '').length;
    // 16字节 = 32个十六进制字符
    recordResult(check('ENCRYPTION_IV 为 16 字节（32个十六进制字符）', ivLength === 32, `当前长度: ${ivLength} 字符`));
}

section('5. 代码质量检查');

// 运行单元测试
try {
    log('运行单元测试...', 'blue');
    const testOutput = execSync('npm test 2>&1', { encoding: 'utf8' });
    const passMatch = testOutput.match(/Tests:\s+(\d+)\s+passed/);
    const failMatch = testOutput.match(/Tests:\s+\d+\s+failed,\s+(\d+)\s+passed/);

    if (passMatch) {
        const passed = parseInt(passMatch[1]);
        recordResult(check(`所有单元测试通过 (${passed}个)`, true));
    } else {
        recordResult(check('所有单元测试通过', false, testOutput.slice(-200)));
    }
} catch (error) {
    recordResult(check('单元测试执行', false, error.message.slice(0, 100)));
}

section('6. 模块完整性检查');

// 检查关键模块是否存在
const criticalModules = [
    'modules/secret-manager.js',
    'modules/activation-crypto.js',
    'modules/vm-detector.js',
    'modules/usage-stats.js',
    'modules/product-name-manager.js'
];

criticalModules.forEach(module => {
    const modulePath = path.join(__dirname, module);
    recordResult(check(`模块 ${module.split('/')[1]} 存在`, fs.existsSync(modulePath)));
});

section('7. 配置文件检查');

// 检查关键的HTML文件
const htmlFiles = ['index.html', 'activation.html', 'module.html', 'advanced-settings.html'];
htmlFiles.forEach(file => {
    recordResult(check(`文件 ${file} 存在`, fs.existsSync(path.join(__dirname, file))));
});

// 检查应用图标
recordResult(check('应用图标 images/icon.ico 存在', fs.existsSync(path.join(__dirname, 'images/icon.ico'))));

// 检查应用配置
recordResult(check('应用配置 apps.json 存在', fs.existsSync(path.join(__dirname, 'apps.json'))));

section('8. 构建配置检查');

// 检查 package.json 中的构建配置
const buildConfig = packageJson.build || {};
recordResult(check('build.appId 已配置', !!buildConfig.appId));
recordResult(check('build.productName 已配置', !!buildConfig.productName));
recordResult(check('build.win.target 包含 NSIS',
    Array.isArray(buildConfig.win?.target) && buildConfig.win.target.includes('nsis')));

section('9. 部署前最终检查');

// 总体检查
recordResult(check('已阅读部署指南 (DEPLOYMENT_GUIDE.md)', fs.existsSync('DEPLOYMENT_GUIDE.md')));
recordResult(check('已备份当前代码库', false, '请手动确认'));

section('部署检查结果');

const totalChecks = passCount + failCount;
const passPercentage = Math.round((passCount / totalChecks) * 100);

console.log(`\n总计检查: ${totalChecks} 项`);
log(`✅ 通过: ${passCount} 项`, 'green');
if (failCount > 0) {
    log(`❌ 失败: ${failCount} 项`, 'red');
}

console.log(`\n通过率: ${passPercentage}%`);

if (passPercentage >= 90) {
    log(`\n✅ 应用已准备好部署到生产环境！`, 'green');
    console.log('\n后续步骤:');
    console.log('1. 运行: npm run build');
    console.log('2. 生成的安装程序位于: ./dist/');
    console.log('3. 在测试环境中验证安装程序');
    console.log('4. 发布到生产环境');
} else if (passPercentage >= 75) {
    log(`\n⚠️  部分检查未通过，建议在部署前解决`, 'yellow');
} else {
    log(`\n❌ 存在严重问题，不建议部署到生产环境`, 'red');
    console.log('\n请修复以下问题:');
    console.log('1. 确保所有安全配置都已正确设置');
    console.log('2. 运行 npm test 并确保所有测试通过');
    console.log('3. 检查所有必需的依赖是否已安装');
}

process.exit(passPercentage >= 75 ? 0 : 1);
