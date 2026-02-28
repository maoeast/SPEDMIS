/**
 * Jest 测试框架配置
 */

module.exports = {
    // 测试环境
    testEnvironment: 'node',

    // 测试匹配模式
    testMatch: ['**/test/**/*.test.js'],

    // 模块名称映射（如果需要）
    moduleNameMapper: {},

    // 覆盖率报告配置
    collectCoverageFrom: [
        'cache.js',
        'config.js',
        'logger.js',
        '!**/node_modules/**',
    ],

    // 覆盖率阈值
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70,
        },
    },

    // 测试超时时间（毫秒）
    testTimeout: 10000,

    // 显示覆盖率报告
    coverageReporters: ['text', 'lcov', 'json-summary'],

    // 详细输出
    verbose: true,
};
